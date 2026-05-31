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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, phone, cpf, cref_cbmf, address } = await req.json()

    if (!name || !email || !phone || !cpf || !cref_cbmf || !address) {
      return new Response(JSON.stringify({ error: 'Todos os campos são obrigatórios.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const tempPassword = generateTempPassword()

    // Cria o usuário no auth
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

    // Insere na tabela users com role coach
    const { error: userError } = await supabase.from('users').upsert({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: 'coach',
      first_login: true,
    }, { onConflict: 'id' })

    if (userError) {
      await supabase.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insere na tabela coaches com os dados profissionais
    const { error: coachError } = await supabase.from('coaches').insert({
      user_id: userId,
      cpf: cpf.trim(),
      cref_cbmf: cref_cbmf.trim(),
      address: address.trim(),
    })

    if (coachError) {
      await supabase.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: coachError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ temp_password: tempPassword }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
