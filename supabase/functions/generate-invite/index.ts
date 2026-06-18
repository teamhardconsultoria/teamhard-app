import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendInviteEmail(email: string, inviteUrl: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0A0A0A;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:#0A0A0A;padding:32px 32px 0;text-align:center">
        <h1 style="color:#E8FF00;font-size:28px;font-weight:900;letter-spacing:4px;margin:0">TEAM HARD</h1>
        <p style="color:#888;font-size:12px;letter-spacing:3px;margin:6px 0 0;text-transform:uppercase">Consultoria Esportiva</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px">Você foi convidado(a)! 💪</h2>
        <p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 28px">
          Seu coach enviou um convite para você criar sua conta no app Team Hard.
          Clique no botão abaixo, preencha seus dados e comece sua jornada!
        </p>

        <div style="text-align:center;margin-bottom:28px">
          <a href="${inviteUrl}" style="display:inline-block;background:#E8FF00;color:#0A0A0A;font-weight:900;padding:16px 32px;border-radius:12px;font-size:15px;letter-spacing:2px;text-decoration:none">
            CRIAR MINHA CONTA
          </a>
        </div>

        <div style="background:#111;border:1px solid #1E1E1E;border-radius:10px;padding:16px;margin-bottom:28px">
          <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Ou copie o link abaixo</p>
          <p style="color:#aaa;font-size:12px;word-break:break-all;margin:0">${inviteUrl}</p>
        </div>

        <p style="color:#555;font-size:12px;text-align:center;margin:0">
          Este link expira em 7 dias · Team Hard Consultoria Esportiva
        </p>
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
      subject: 'Você foi convidado(a) para o Team Hard! 💪',
      html,
    }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const { email, coach_id: coachIdOverride } = await req.json()

    let coachId: string

    if (userProfile?.role === 'super_admin') {
      if (!coachIdOverride) {
        return new Response(JSON.stringify({ error: 'Selecione um coach.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      coachId = coachIdOverride
    } else {
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!coach) {
        return new Response(JSON.stringify({ error: 'Coach não encontrado.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      coachId = coach.id
    }

    const { data: invite, error: inviteError } = await supabase
      .from('student_invites')
      .insert({
        coach_id: coachId,
        email: email ? email.trim().toLowerCase() : null,
      })
      .select('token')
      .single()

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://teamhard-app.vercel.app'
    const inviteUrl = `${appUrl}/register/${invite.token}`

    if (email) {
      await sendInviteEmail(email.trim().toLowerCase(), inviteUrl)
    }

    return new Response(JSON.stringify({ invite_url: inviteUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
