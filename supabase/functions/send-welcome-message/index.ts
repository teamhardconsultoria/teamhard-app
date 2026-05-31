import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_WELCOME =
  'Olá, {student_name}! 👋 Seja bem-vindo(a) ao Team Hard! Estou aqui para te ajudar a alcançar seus objetivos. Qualquer dúvida é só me chamar aqui no chat. Bora juntos! 💪'

const DEFAULT_ANAMNESE_REMINDER =
  'Olá, {student_name}! 📋 Para começarmos bem, preencha sua anamnese e envie sua avaliação física inicial pelo app. Essas informações são essenciais para eu montar o plano ideal para você. Qualquer dúvida, é só chamar! 💪'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { student_user_id } = await req.json()
    if (!student_user_id) {
      return new Response(JSON.stringify({ error: 'student_user_id obrigatório' }), { status: 400, headers: cors })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get student row + student name
    const { data: student } = await supabase
      .from('students')
      .select('id, coach_id, user:users(name)')
      .eq('user_id', student_user_id)
      .single()

    if (!student?.coach_id) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_coach' }), { headers: cors })
    }

    // Get coach's user_id
    const { data: coach } = await supabase
      .from('coaches')
      .select('user_id')
      .eq('id', student.coach_id)
      .single()

    if (!coach?.user_id) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_coach_user' }), { headers: cors })
    }

    // Get welcome template for this coach (if configured)
    const { data: tpl } = await supabase
      .from('message_templates')
      .select('content, active')
      .eq('coach_id', student.coach_id)
      .eq('type', 'welcome')
      .maybeSingle()

    if (tpl && !tpl.active) {
      return new Response(JSON.stringify({ sent: false, reason: 'template_inactive' }), { headers: cors })
    }

    const studentName = (student.user as any)?.name ?? ''
    const firstName = studentName.split(' ')[0] || studentName
    const rawContent = tpl?.content ?? DEFAULT_WELCOME
    const content = rawContent.replace(/\{student_name\}/g, firstName)

    // Insert welcome message from coach → student
    await supabase.from('messages').insert({
      sender_id: coach.user_id,
      receiver_id: student_user_id,
      content,
      type: 'text',
    })

    // Anamnese + assessment reminder (sent right after welcome)
    const { data: anamneseTpl } = await supabase
      .from('message_templates')
      .select('content, active')
      .eq('coach_id', student.coach_id)
      .eq('type', 'anamnese_reminder')
      .maybeSingle()

    if (!anamneseTpl || anamneseTpl.active !== false) {
      const anamneseContent = (anamneseTpl?.content ?? DEFAULT_ANAMNESE_REMINDER)
        .replace(/\{student_name\}/g, firstName)
      await supabase.from('messages').insert({
        sender_id: coach.user_id,
        receiver_id: student_user_id,
        content: anamneseContent,
        type: 'text',
      })
    }

    return new Response(JSON.stringify({ sent: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
