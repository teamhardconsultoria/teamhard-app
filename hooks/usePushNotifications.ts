import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

const MS_24H = 24 * 60 * 60 * 1000

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export function usePushNotifications() {
  const { user } = useAuthStore()
  const responseListener = useRef<Notifications.Subscription | null>(null)

  useEffect(() => {
    if (!user) return

    registerAndSaveToken(user.id)

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Mensagens',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E8FF00',
        sound: 'default',
      })
      Notifications.setNotificationChannelAsync('assessment', {
        name: 'Avaliações',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#E8FF00',
        sound: 'default',
      })
      Notifications.setNotificationChannelAsync('payments', {
        name: 'Pagamentos',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#E8FF00',
        sound: 'default',
      })
    }

    checkPendingPayments(user.id)
    checkPendingAssessment(user.id)

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>
      if (data?.screen) {
        router.push(data.screen as any)
      }
    })

    return () => {
      responseListener.current?.remove()
    }
  }, [user?.id])
}

async function registerAndSaveToken(userId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId && projectId !== 'SEU_EAS_PROJECT_ID' ? { projectId } : undefined
    )

    await supabase
      .from('users')
      .update({ push_token: tokenData.data })
      .eq('id', userId)
  } catch {
    // Simuladores não suportam push tokens
  }
}

async function checkPendingPayments(userId: string) {
  try {
    const key = `last_payment_notif_${userId}`
    const last = await SecureStore.getItemAsync(key)
    if (last && Date.now() - Number(last) < MS_24H) return

    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!student) return

    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .in('status', ['pending', 'overdue'])

    if (!count || count === 0) return

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Pagamento pendente',
        body: count === 1
          ? 'Você tem 1 pagamento pendente. Regularize para continuar.'
          : `Você tem ${count} pagamentos pendentes. Regularize para continuar.`,
        data: { screen: '/(student)/payments' },
        sound: 'default',
        ...(Platform.OS === 'android' ? { android: { channelId: 'payments' } } : {}),
      },
      trigger: null,
    })

    await SecureStore.setItemAsync(key, String(Date.now()))
  } catch {
    // Falha silenciosa
  }
}

async function checkPendingAssessment(userId: string) {
  try {
    const key = `last_assessment_notif_${userId}`
    const last = await SecureStore.getItemAsync(key)
    if (last && Date.now() - Number(last) < MS_24H) return

    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!student) return

    const { data: all } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1)

    const hasAny = all && all.length > 0

    if (hasAny) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      if (all![0].created_at >= thirtyDaysAgo) return
    }

    const title = hasAny ? 'Envie suas fotos de progresso!' : 'Faça sua primeira avaliação!'
    const body = hasAny
      ? 'Já faz mais de 30 dias desde sua última avaliação. Registre sua evolução!'
      : 'Envie suas fotos para o seu coach iniciar seu acompanhamento personalizado.'

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { screen: '/(student)/assessment' },
        sound: 'default',
        ...(Platform.OS === 'android' ? { android: { channelId: 'assessment' } } : {}),
      },
      trigger: null,
    })

    await SecureStore.setItemAsync(key, String(Date.now()))
  } catch {
    // Falha silenciosa
  }
}
