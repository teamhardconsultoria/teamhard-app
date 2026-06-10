import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok = (body: object) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

// ─── Helpers base64url ────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  bytes.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - s.length % 4) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0))
}

// ─── VAPID JWT (ECDSA P-256, via JWK) ────────────────────────────────────────

async function makeVapidJwt(endpoint: string, privB64: string, pubB64: string, email: string): Promise<string> {
  const url = new URL(endpoint)
  const aud = `${url.protocol}//${url.host}`
  const exp = Math.floor(Date.now() / 1000) + 43200

  const pubRaw = fromB64url(pubB64) // 65 bytes: 0x04 + X(32) + Y(32)
  const x = b64url(pubRaw.slice(1, 33))
  const y = b64url(pubRaw.slice(33, 65))

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privB64, x, y, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const enc = (v: object) => b64url(new TextEncoder().encode(JSON.stringify(v)))
  const head = enc({ typ: 'JWT', alg: 'ES256' })
  const body = enc({ aud, exp, sub: `mailto:${email}` })
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(sig)}`
}

// ─── Web Push: encrypt payload (aes128gcm) ────────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dh: string,
  auth: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const te = new TextEncoder()

  // Gera par de chaves efêmero para o servidor
  const serverKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKp.publicKey))

  // Chave pública do browser
  const clientPubRaw = fromB64url(p256dh)
  const clientPubKey = await crypto.subtle.importKey('raw', clientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, serverKp.privateKey, 256)

  const authBytes = fromB64url(auth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF PRK (auth secret extraction)
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits'])

  const infoAuth = new Uint8Array([
    ...te.encode('WebPush: info\x00'),
    ...clientPubRaw,
    ...serverPubRaw,
  ])

  // IKM
  const ikmBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: infoAuth },
    hkdfKey,
    256,
  )
  const ikmKey = await crypto.subtle.importKey('raw', ikmBits, 'HKDF', false, ['deriveBits'])

  const cekInfo  = te.encode('Content-Encoding: aes128gcm\x00')
  const nonceInfo = te.encode('Content-Encoding: nonce\x00')

  const cekBits   = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo   }, ikmKey, 128)
  const nonceBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96)

  const cekKey = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt'])
  const nonce  = new Uint8Array(nonceBits)

  // Payload com padding delimiter \x02
  const record = new Uint8Array([...te.encode(plaintext), 0x02])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, record))

  return { ciphertext, salt, serverPublicKey: serverPubRaw }
}

function buildAes128gcmBody(
  ciphertext: Uint8Array,
  salt: Uint8Array,
  serverPublicKey: Uint8Array,
): Uint8Array {
  // Header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = ciphertext.length + 16 // record size (standard: 4096)
  const buf = new Uint8Array(16 + 4 + 1 + serverPublicKey.length + ciphertext.length)
  let off = 0
  buf.set(salt, off); off += 16
  new DataView(buf.buffer).setUint32(off, rs, false); off += 4
  buf[off++] = serverPublicKey.length
  buf.set(serverPublicKey, off); off += serverPublicKey.length
  buf.set(ciphertext, off)
  return buf
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { student_id, exercise_name, rest_seconds, nonce } = await req.json()
    if (!student_id || !rest_seconds || !nonce) return ok({ sent: false, reason: 'missing_params' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: student } = await supabase
      .from('students')
      .select('user_id')
      .eq('id', student_id)
      .single()
    if (!student?.user_id) return ok({ sent: false, reason: 'no_student' })

    const { data: user } = await supabase
      .from('users')
      .select('web_push_subscription')
      .eq('id', student.user_id)
      .single()

    const sub = user?.web_push_subscription
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return ok({ sent: false, reason: 'no_subscription' })
    }

    // Aguarda o descanso no servidor
    await new Promise(r => setTimeout(r, rest_seconds * 1000))

    // Checa nonce — se o aluno pulou/pausou, o nonce mudou e não envia
    const { data: check } = await supabase
      .from('students')
      .select('rest_nonce')
      .eq('id', student_id)
      .single()
    if (check?.rest_nonce !== nonce) return ok({ sent: false, reason: 'cancelled' })

    const vapidPub  = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY')!
    const email     = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'teamhard.consultoria@gmail.com'

    const jwt = await makeVapidJwt(sub.endpoint, vapidPriv, vapidPub, email)

    const notifText = JSON.stringify({
      title: 'Descanso finalizado! 💪',
      body: exercise_name ? `Próxima série: ${exercise_name}` : 'Hora da próxima série!',
    })

    const { ciphertext, salt, serverPublicKey } = await encryptPayload(notifText, sub.keys.p256dh, sub.keys.auth)
    const body = buildAes128gcmBody(ciphertext, salt, serverPublicKey)

    const pushRes = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt},k=${vapidPub}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '60',
      },
      body,
    })

    if (!pushRes.ok && pushRes.status !== 201) {
      const txt = await pushRes.text().catch(() => '')
      throw new Error(`Push endpoint ${pushRes.status}: ${txt}`)
    }

    return ok({ sent: true })
  } catch (e) {
    console.error('rest-timer-notify:', e)
    return ok({ sent: false, reason: String(e) })
  }
})
