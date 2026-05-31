import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok = (body: object) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

const err = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { user_id, title, body, data, channel_id } = await req.json()

    if (!user_id || !title || !body) return err('Parâmetros inválidos')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: user } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', user_id)
      .single()

    if (!user?.push_token) return ok({ sent: false, reason: 'no_token' })

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: user.push_token,
        sound: 'default',
        title,
        body,
        data: data || {},
        channelId: channel_id || 'default',
      }),
    })

    const result = await res.json()
    return ok({ sent: true, result })
  } catch (e) {
    return err(`Erro interno: ${String(e)}`)
  }
})
