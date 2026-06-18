import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json()
    const { action, token } = body

    // Validate invite token (used on page load to pre-fill email and check expiry)
    if (action === 'validate') {
      if (!token) {
        return new Response(JSON.stringify({ valid: false, error: 'Token não informado.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: invite } = await supabase
        .from('student_invites')
        .select('id, email, used_at, expires_at')
        .eq('token', token)
        .single()

      if (!invite) {
        return new Response(JSON.stringify({ valid: false, error: 'Link inválido.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (invite.used_at) {
        return new Response(JSON.stringify({ valid: false, error: 'Este link já foi utilizado.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (new Date(invite.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, error: 'Este link expirou.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ valid: true, email: invite.email }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Register student via invite
    if (action === 'register') {
      const { name, email, password, phone } = body

      if (!token || !name || !email || !password) {
        return new Response(JSON.stringify({ error: 'Dados incompletos.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate token
      const { data: invite } = await supabase
        .from('student_invites')
        .select('id, coach_id, used_at, expires_at')
        .eq('token', token)
        .single()

      if (!invite) {
        return new Response(JSON.stringify({ error: 'Link inválido.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (invite.used_at) {
        return new Response(JSON.stringify({ error: 'Este link já foi utilizado.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (new Date(invite.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Este link expirou.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Create auth user with the student's chosen password
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
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
        phone: phone?.trim() || null,
        role: 'student',
        first_login: true,
      }, { onConflict: 'id' })

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .insert({
          user_id: userId,
          coach_id: invite.coach_id,
          payment_status: 'pending',
        })
        .select('id')
        .single()

      if (studentError) {
        await supabase.auth.admin.deleteUser(userId)
        return new Response(JSON.stringify({ error: studentError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabase
        .from('student_invites')
        .update({ used_at: new Date().toISOString(), student_id: studentData.id })
        .eq('id', invite.id)

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
