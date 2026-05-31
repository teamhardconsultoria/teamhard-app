import { supabase } from './supabase'

export type AutoMessageType = 'workout_assigned' | 'diet_assigned' | 'payment_pending'

const DEFAULTS: Record<AutoMessageType, string> = {
  workout_assigned: 'Olá, {student_name}! 💪 Seu novo treino já está disponível no app. Acesse agora e bora treinar!',
  diet_assigned: 'Olá, {student_name}! 🥗 Sua nova dieta já está disponível no app. Qualquer dúvida, é só falar!',
  payment_pending: 'Olá, {student_name}! Você tem uma cobrança pendente. Regularize para continuar com acesso ao app. Qualquer dúvida, entre em contato!',
}

export async function sendAutoMessage({
  coachUserId,
  coachId,
  studentId,
  type,
  studentName,
}: {
  coachUserId: string
  coachId: string
  studentId: string
  type: AutoMessageType
  studentName: string
}) {
  try {
    const { data: tpl } = await supabase
      .from('message_templates')
      .select('content, active')
      .eq('coach_id', coachId)
      .eq('type', type)
      .maybeSingle()

    if (tpl && !tpl.active) return

    const firstName = studentName.split(' ')[0]
    const content = (tpl?.content ?? DEFAULTS[type]).replace(/\{student_name\}/g, firstName)

    const { data: student } = await supabase
      .from('students')
      .select('user_id')
      .eq('id', studentId)
      .single()

    if (!student?.user_id) return

    await supabase.from('messages').insert({
      sender_id: coachUserId,
      receiver_id: student.user_id,
      content,
      type: 'text',
    })

    supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: student.user_id,
        title: 'Nova mensagem do seu coach',
        body: content.length > 80 ? content.slice(0, 80) + '…' : content,
        data: { screen: '/(student)/chat' },
        channel_id: 'messages',
      },
    })
  } catch {
    // Falha silenciosa — não interrompe o fluxo principal
  }
}
