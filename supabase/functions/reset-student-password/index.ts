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

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!'
  let pwd = ''
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { student_id } = await req.json()
    if (!student_id) return err('student_id obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: student } = await supabase
      .from('students')
      .select('user:users(id)')
      .eq('id', student_id)
      .single()

    if (!student?.user) return err('Aluno não encontrado')

    const userId = (student.user as any).id
    const tempPassword = generatePassword()

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: tempPassword,
    })

    if (error) return err(error.message)

    await supabase.from('users').update({ first_login: true }).eq('id', userId)

    return ok({ temp_password: tempPassword })
  } catch (e) {
    return err(`Erro interno: ${String(e)}`)
  }
})
