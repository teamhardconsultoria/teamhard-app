import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ReminderType = 'plan_expiry' | 'photos' | 'questionnaires'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { type, coach_id }: { type: ReminderType; coach_id?: string } = await req.json()

  const now = new Date()
  const today = toDate(now)
  let sent = 0

  if (type === 'plan_expiry') {
    // 7-day warning
    const in7 = toDate(now, 7)
    const { data: exp7 } = await supabase
      .from('students')
      .select('user_id')
      .eq('plan_end', in7)
      .eq('payment_status', 'active')

    for (const s of exp7 || []) {
      await push(supabase, s.user_id,
        '⏰ Plano vence em 7 dias',
        'Renove seu plano para continuar treinando com seu coach.',
        '/(student)/home')
      sent++
    }

    // 3-day warning
    const in3 = toDate(now, 3)
    const { data: exp3 } = await supabase
      .from('students')
      .select('user_id')
      .eq('plan_end', in3)
      .eq('payment_status', 'active')

    for (const s of exp3 || []) {
      await push(supabase, s.user_id,
        '🚨 Plano vence em 3 dias!',
        'Não perca acesso ao seu treino. Renove agora!',
        '/(student)/home')
      sent++
    }
  }

  if (type === 'photos') {
    const ago30 = toDate(now, -30)

    let query = supabase.from('students').select('id, user_id').eq('payment_status', 'active')
    if (coach_id) query = query.eq('coach_id', coach_id)
    const { data: students } = await query

    const { data: recent } = await supabase
      .from('assessments')
      .select('student_id')
      .gte('created_at', ago30 + 'T00:00:00')
      .in('student_id', (students || []).map(s => s.id).length ? (students || []).map(s => s.id) : ['none'])

    const recentIds = new Set(recent?.map(a => a.student_id) || [])

    for (const s of students || []) {
      if (!recentIds.has(s.id)) {
        await push(supabase, s.user_id,
          '📸 Envie suas fotos de progresso!',
          'Já faz mais de 30 dias. Registre sua evolução enviando as fotos para seu coach.',
          '/(student)/assessments')
        sent++
      }
    }
  }

  if (type === 'questionnaires') {
    // Students with pending assignments (no response yet, due_date passed or today)
    let query = supabase
      .from('questionnaire_assignments')
      .select('questionnaire_id, student_id, students!inner(user_id, coach_id, payment_status)')
      .lte('due_date', today)
      .not('due_date', 'is', null)

    const { data: assignments } = await query

    // Filter out already answered ones
    const pendingUserIds: string[] = []
    for (const a of assignments || []) {
      const st = (a as any).students
      if (st.payment_status !== 'active') continue
      if (coach_id && st.coach_id !== coach_id) continue

      const { count } = await supabase
        .from('questionnaire_responses')
        .select('id', { count: 'exact', head: true })
        .eq('questionnaire_id', a.questionnaire_id)
        .eq('student_id', a.student_id)

      if (!count) pendingUserIds.push(st.user_id)
    }

    // Deduplicate by user_id
    const unique = [...new Set(pendingUserIds)]
    for (const uid of unique) {
      await push(supabase, uid,
        '📋 Questionário aguardando!',
        'Você tem um questionário para responder. Leva poucos minutos!',
        '/(student)/questionnaires')
      sent++
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

function toDate(d: Date, addDays = 0): string {
  const copy = new Date(d.getTime() + addDays * 86400000)
  return copy.toISOString().split('T')[0]
}

async function push(supabase: any, userId: string, title: string, body: string, screen: string) {
  const { data: user } = await supabase
    .from('users').select('push_token').eq('id', userId).single()
  if (!user?.push_token) return

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      to: user.push_token,
      title,
      body,
      sound: 'default',
      data: { screen },
    }),
  })
}
