import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlB64ToUint8(b64: string): Uint8Array {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - b64.length % 4) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0))
}

export async function subscribeWebPush(userId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    if (!VAPID_PUBLIC_KEY) return false
    if (Notification.permission !== 'granted') return false

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY).buffer.slice(0) as ArrayBuffer,
    })

    await supabase
      .from('users')
      .update({ web_push_subscription: sub.toJSON() })
      .eq('id', userId)

    return true
  } catch (e) {
    console.warn('subscribeWebPush failed:', e)
    return false
  }
}

export async function scheduleRestNotification(
  studentId: string,
  exerciseName: string,
  restSeconds: number,
  nonce: string,
): Promise<void> {
  try {
    await supabase.functions.invoke('rest-timer-notify', {
      body: { student_id: studentId, exercise_name: exerciseName, rest_seconds: restSeconds, nonce },
    })
  } catch (e) {
    console.warn('scheduleRestNotification failed:', e)
  }
}

export async function invalidateRestNonce(studentId: string, nonce: string): Promise<void> {
  try {
    await supabase
      .from('students')
      .update({ rest_nonce: nonce })
      .eq('id', studentId)
  } catch { /* non-critical */ }
}
