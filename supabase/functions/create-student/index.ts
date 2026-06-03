import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (const byte of array) {
    result += chars[byte % chars.length]
  }
  return result
}

function calcPlanEnd(start: string, planType: string): string {
  const date = new Date(start)
  switch (planType) {
    case 'quarterly':   date.setMonth(date.getMonth() + 3);  break
    case 'semiannual':  date.setMonth(date.getMonth() + 6);  break
    case 'annual':
    case 'permuta':     date.setFullYear(date.getFullYear() + 1); break
    default:            date.setMonth(date.getMonth() + 1);  break
  }
  return date.toISOString().split('T')[0]
}

async function sendWhatsApp(phone: string, name: string, email: string, password: string) {
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID')
  const token      = Deno.env.get('ZAPI_TOKEN')
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')
  if (!instanceId || !token) return

  const digits = phone.replace(/\D/g, '')
  const firstName = name.split(' ')[0]
  const message = [
    `Olá, ${firstName}! 💪 Seja bem-vindo(a) ao *Team Hard*!`,
    '',
    `Seu acesso ao app foi criado:`,
    `📧 E-mail: ${email}`,
    `🔑 Senha provisória: *${password}*`,
    '',
    `No primeiro acesso você será solicitado(a) a criar uma nova senha.`,
    '',
    `_Team Hard Consultoria Esportiva_`,
  ].join('\n')

  await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {}),
    },
    body: JSON.stringify({ phone: digits, message }),
  })
}

async function sendWelcomeEmail(email: string, name: string, password: string) {
  const firstName = name.split(' ')[0]
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0A0A0A;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:#0A0A0A;padding:32px 32px 0;text-align:center">
        <h1 style="color:#E8FF00;font-size:28px;font-weight:900;letter-spacing:4px;margin:0">TEAM HARD</h1>
        <p style="color:#888;font-size:12px;letter-spacing:3px;margin:6px 0 0;text-transform:uppercase">Consultoria Esportiva</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px">Bem-vindo, ${firstName}! 💪</h2>
        <p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 28px">Seu acesso ao app Team Hard foi criado. Use as credenciais abaixo para entrar.</p>

        <div style="background:#111;border:1px solid #1E1E1E;border-radius:10px;padding:20px;margin-bottom:28px">
          <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">E-mail</p>
          <p style="color:#fff;font-size:15px;font-weight:600;margin:0 0 16px">${email}</p>
          <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Senha temporária</p>
          <p style="color:#E8FF00;font-size:20px;font-weight:900;letter-spacing:3px;margin:0">${password}</p>
        </div>

        <p style="color:#aaa;font-size:13px;line-height:1.6;margin:0 0 28px">⚠️ No primeiro acesso você será solicitado a criar uma nova senha.</p>

        <div style="background:#111;border:1px solid #1E1E1E;border-radius:10px;padding:20px;margin-bottom:28px">
          <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Download do App</p>
          <p style="color:#aaa;font-size:13px;margin:0">O link para instalação do app será disponibilizado em breve.</p>
        </div>

        <p style="color:#555;font-size:12px;text-align:center;margin:0">Team Hard Consultoria Esportiva · teamhard.consultoria@gmail.com</p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Team Hard <onboarding@resend.dev>',
      to: email,
      subject: `Bem-vindo ao Team Hard, ${firstName}! 💪`,
      html,
    }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, phone, plan_type, plan_start, coach_id } = await req.json()

    if (!name || !email || !coach_id) {
      return new Response(JSON.stringify({ error: 'name, email e coach_id são obrigatórios.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const tempPassword = generateTempPassword()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError) {
      const msg = authError.message.includes('already registered')
        ? 'Este e-mail já está cadastrado.'
        : authError.message
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = authData.user!.id

    await supabase.from('users').upsert({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || null,
      role: 'student',
      first_login: true,
    }, { onConflict: 'id' })

    const planEnd = calcPlanEnd(plan_start || new Date().toISOString().split('T')[0], plan_type || 'monthly')

    const { data: studentData, error: studentError } = await supabase.from('students').insert({
      user_id: userId,
      coach_id,
      plan_type: plan_type || 'monthly',
      plan_start: plan_start || new Date().toISOString().split('T')[0],
      plan_end: planEnd,
      payment_status: plan_type === 'permuta' ? 'active' : 'pending',
    }).select('id').single()

    if (studentError) {
      await supabase.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: studentError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await sendWelcomeEmail(email.trim(), name.trim(), tempPassword)
    if (phone) await sendWhatsApp(phone.trim(), name.trim(), email.trim(), tempPassword)

    return new Response(JSON.stringify({ tempPassword, phone: phone || null, student_id: studentData?.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
