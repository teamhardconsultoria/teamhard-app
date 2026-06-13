import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ReminderType =
  | 'plan_expiry'
  | 'photos'
  | 'questionnaires'
  | 'assessment_day'
  | 'weekly_checkin'
  | 'red_alert'
  | 'send_pending'

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

  // ─────────────────────────────────────────────────────────────────
  // Lembretes existentes
  // ─────────────────────────────────────────────────────────────────

  if (type === 'plan_expiry') {
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
    let query = supabase
      .from('questionnaire_assignments')
      .select('questionnaire_id, student_id, students!inner(user_id, coach_id, payment_status)')
      .lte('due_date', today)
      .not('due_date', 'is', null)

    const { data: assignments } = await query

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

    const unique = [...new Set(pendingUserIds)]
    for (const uid of unique) {
      await push(supabase, uid,
        '📋 Questionário aguardando!',
        'Você tem um questionário para responder. Leva poucos minutos!',
        '/(student)/questionnaires')
      sent++
    }
  }

  if (type === 'assessment_day') {
    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, coach_id, users(name), coaches(user_id)')
      .eq('assessment_scheduled_date', today)
      .eq('payment_status', 'active')

    const DEFAULT_MSG = 'Olá, {student_name}! 📅 Hoje é o dia da sua avaliação. Não se esqueça! Qualquer dúvida, estou aqui.'

    for (const s of students || []) {
      const coachUserId = (s as any).coaches?.user_id
      if (!coachUserId || !s.user_id) continue

      const { data: tpl } = await supabase
        .from('message_templates')
        .select('content, active')
        .eq('coach_id', s.coach_id)
        .eq('type', 'assessment_day')
        .maybeSingle()

      if (tpl && !tpl.active) continue

      const firstName = ((s as any).users?.name ?? '').split(' ')[0] || 'aluno'
      const content = (tpl?.content ?? DEFAULT_MSG).replace(/\{student_name\}/g, firstName)

      await supabase.from('messages').insert({
        sender_id: coachUserId,
        receiver_id: s.user_id,
        content,
        type: 'text',
      })

      await push(supabase, s.user_id,
        'Nova mensagem do seu coach',
        content.length > 80 ? content.slice(0, 80) + '…' : content,
        '/(student)/chat')

      sent++
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NOVO: Check-in semanal automático (toda segunda-feira)
  // ─────────────────────────────────────────────────────────────────

  if (type === 'weekly_checkin') {
    const lastMonday = getLastMonday(now)

    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, coach_id, users(name)')
      .eq('payment_status', 'active')
      .eq('access_blocked', false)

    if (students?.length) {
      const studentIds = students.map((s: any) => s.id)

      // Quais já receberam check-in essa semana
      const { data: alreadySent } = await supabase
        .from('weekly_checkins')
        .select('student_id')
        .in('student_id', studentIds)
        .eq('week_start', lastMonday)

      const alreadySentIds = new Set(alreadySent?.map((c: any) => c.student_id) || [])

      // user_id de cada coach
      const coachIds = [...new Set(students.map((s: any) => s.coach_id))]
      const { data: coaches } = await supabase
        .from('coaches')
        .select('id, user_id')
        .in('id', coachIds)
      const coachUserMap = new Map((coaches || []).map((c: any) => [c.id, c.user_id]))

      const CHECKIN_MSG = 'Como foi sua semana? Treinos realizados, dificuldades e como está se sentindo?'

      for (const s of students) {
        if (alreadySentIds.has(s.id)) continue
        const coachUserId = coachUserMap.get(s.coach_id)
        if (!coachUserId || !s.user_id) continue

        const firstName = ((s as any).users?.name ?? '').split(' ')[0] || 'aluno'

        const { data: msg } = await supabase
          .from('messages')
          .insert({ sender_id: coachUserId, receiver_id: s.user_id, content: CHECKIN_MSG, type: 'text' })
          .select('id')
          .single()

        await supabase.from('weekly_checkins').insert({
          coach_id: s.coach_id,
          student_id: s.id,
          week_start: lastMonday,
          message_id: msg?.id ?? null,
        })

        await push(supabase, s.user_id,
          'Check-in semanal 💬',
          `${firstName}, como foi sua semana? Conta para o coach!`,
          '/(student)/chat')

        sent++
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NOVO: Detecta alunos vermelhos e agenda mensagem para 24h depois
  // ─────────────────────────────────────────────────────────────────

  if (type === 'red_alert') {
    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, coach_id, users(name)')
      .eq('payment_status', 'active')
      .eq('access_blocked', false)

    if (students?.length) {
      const studentIds = students.map((s: any) => s.id)
      const studentUserIds = students.map((s: any) => s.user_id)

      const coachIds = [...new Set(students.map((s: any) => s.coach_id))]
      const { data: coaches } = await supabase
        .from('coaches')
        .select('id, user_id')
        .in('id', coachIds)
      const coachUserMap = new Map((coaches || []).map((c: any) => [c.id, c.user_id]))

      // Última sessão de treino por aluno (últimos 30 dias)
      const thirtyDaysAgo = toDate(now, -30) + 'T00:00:00'
      const { data: sessions } = await supabase
        .from('training_sessions')
        .select('student_id, started_at')
        .in('student_id', studentIds)
        .gte('started_at', thirtyDaysAgo)
        .order('started_at', { ascending: false })

      const lastTraining = new Map<string, string>()
      for (const s of sessions || []) {
        if (!lastTraining.has((s as any).student_id)) lastTraining.set((s as any).student_id, (s as any).started_at)
      }

      // Mensagens enviadas por alunos nas últimas 2 semanas
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('sender_id')
        .in('sender_id', studentUserIds)
        .gte('created_at', fourteenDaysAgo)

      const activeUsers = new Set((recentMsgs || []).map((m: any) => m.sender_id))

      // Alertas já criados nos últimos 7 dias (evita duplicatas)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
      const { data: existingAlerts } = await supabase
        .from('pending_messages')
        .select('student_id')
        .in('student_id', studentIds)
        .eq('trigger_type', 'red_alert')
        .in('status', ['pending', 'sent'])
        .gte('created_at', sevenDaysAgo)

      const alertedIds = new Set((existingAlerts || []).map((a: any) => a.student_id))

      for (const s of students) {
        if (alertedIds.has(s.id)) continue
        const coachUserId = coachUserMap.get(s.coach_id)
        if (!coachUserId || !s.user_id) continue

        const lastTrain = lastTraining.get(s.id)
        const daysSince = lastTrain
          ? Math.floor((now.getTime() - new Date(lastTrain).getTime()) / 86400000)
          : 999

        const hasMsg2Weeks = activeUsers.has(s.user_id)
        const isRed = daysSince >= 5 || !hasMsg2Weeks
        if (!isRed) continue

        const firstName = ((s as any).users?.name ?? '').split(' ')[0] || 'aluno'
        const content = `Ei ${firstName}, notei que você sumiu! Tudo bem? Estou aqui para te ajudar.`
        const scheduledFor = new Date(now.getTime() + 24 * 3600000).toISOString()

        await supabase.from('pending_messages').insert({
          coach_id: s.coach_id,
          student_id: s.id,
          content,
          trigger_type: 'red_alert',
          scheduled_for: scheduledFor,
        })

        sent++
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NOVO: Envia mensagens pendentes cujo horário já chegou
  // ─────────────────────────────────────────────────────────────────

  if (type === 'send_pending') {
    const { data: pending } = await supabase
      .from('pending_messages')
      .select('id, coach_id, student_id, content')
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())

    if (pending?.length) {
      const studentIds = [...new Set(pending.map((pm: any) => pm.student_id))]
      const coachIds   = [...new Set(pending.map((pm: any) => pm.coach_id))]

      const [{ data: students }, { data: coaches }] = await Promise.all([
        supabase.from('students').select('id, user_id').in('id', studentIds),
        supabase.from('coaches').select('id, user_id').in('id', coachIds),
      ])

      const studentUserMap = new Map((students || []).map((s: any) => [s.id, s.user_id]))
      const coachUserMap   = new Map((coaches  || []).map((c: any) => [c.id, c.user_id]))

      for (const pm of pending) {
        const studentUserId = studentUserMap.get((pm as any).student_id)
        const coachUserId   = coachUserMap.get((pm as any).coach_id)
        if (!studentUserId || !coachUserId) continue

        const { data: msg } = await supabase
          .from('messages')
          .insert({ sender_id: coachUserId, receiver_id: studentUserId, content: (pm as any).content, type: 'text' })
          .select('id')
          .single()

        await supabase.from('pending_messages').update({
          status: 'sent',
          sent_at: now.toISOString(),
          sent_message_id: msg?.id ?? null,
          updated_at: now.toISOString(),
        }).eq('id', (pm as any).id)

        const body = (pm as any).content
        await push(supabase, studentUserId,
          'Nova mensagem do seu coach',
          body.length > 80 ? body.slice(0, 80) + '…' : body,
          '/(student)/chat')

        sent++
      }
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

function getLastMonday(d: Date): string {
  const day = d.getDay() // 0=Dom, 1=Seg...6=Sáb
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(d.getTime() - diff * 86400000)
  return monday.toISOString().split('T')[0]
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
