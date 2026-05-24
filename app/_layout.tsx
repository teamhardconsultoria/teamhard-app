import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePushNotifications } from '@/hooks/usePushNotifications'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const { setSession, fetchUser, user, loading } = useAuthStore()
  usePushNotifications()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUser()
      else useAuthStore.setState({ loading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUser()
      else useAuthStore.setState({ user: null, loading: false })
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return
    SplashScreen.hideAsync()

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
        router.replace('/(student)/home')
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
