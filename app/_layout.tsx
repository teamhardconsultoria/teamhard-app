import { useEffect } from 'react'
import { Alert, LogBox } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePushNotifications } from '@/hooks/usePushNotifications'

LogBox.ignoreLogs(['unable to activate keep awake', 'Unable to activate keep awake'])

export default function RootLayout() {
  const { setSession, fetchUser, user, loading } = useAuthStore()
  usePushNotifications()

  useEffect(() => {
    const timeout = setTimeout(() => {
      useAuthStore.setState({ user: null, loading: false })
    }, 8000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUser().finally(() => clearTimeout(timeout))
      else { useAuthStore.setState({ loading: false }); clearTimeout(timeout) }
    }).catch(() => { useAuthStore.setState({ user: null, loading: false }); clearTimeout(timeout) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUser()
      else useAuthStore.setState({ user: null, loading: false })
    })

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace('/(auth)/login')
      return
    }

    try {
      if (user.first_login) {
        router.replace('/(auth)/change-password')
        return
      }

      if (user.role === 'student') {
        if (!user.anamnese_completed) {
          router.replace('/onboarding/anamnese')
        } else {
          router.replace('/(student)/home')
        }
      } else if (user.role === 'coach' || user.role === 'super_admin') {
        router.replace('/(coach)/dashboard')
      } else {
        router.replace('/(auth)/login')
      }
    } catch (e: any) {
      Alert.alert('Erro de navegação', e?.message || String(e))
    }
  }, [user, loading])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <StatusBar style="light" backgroundColor="#0A0A0A" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }} />
    </GestureHandlerRootView>
  )
}
