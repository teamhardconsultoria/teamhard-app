import { supabase } from './supabase'

export async function sendPushToStudent(studentId: string, title: string, body: string, screen: string) {
  const { data: student } = await supabase
    .from('students')
    .select('user_id')
    .eq('id', studentId)
    .single()
  if (!student?.user_id) return

  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', student.user_id)
    .single()
  if (!user?.push_token) return

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: user.push_token, title, body, sound: 'default', data: { screen } }),
  })
}
