import { useEffect, useState } from 'react'
import { Tabs, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/lib/theme'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'

export default function StudentLayout() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 56 + insets.bottom
  const { user } = useAuthStore()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .is('read_at', null)
      setUnread(count || 0)
    }
    fetchUnread()

    const sub = supabase
      .channel(`student-tab-unread-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any
        if (msg.receiver_id !== user.id) return
        setUnread(p => p + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [user])

  useEffect(() => {
    if (pathname === '/chat') setUnread(0)
  }, [pathname])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: colors.yellow,
        tabBarInactiveTintColor: colors.subtext,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout/index"
        options={{
          title: 'Treino',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="diet/index"
        options={{
          title: 'Dieta',
          tabBarIcon: ({ color, size }) => <Ionicons name="nutrition" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble" size={size} color={color} />,
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.yellow, color: '#0A0A0A', fontSize: 10, fontWeight: '900' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      {/* Telas sem tab */}
      <Tabs.Screen name="workout/[id]" options={{ href: null }} />
      <Tabs.Screen name="workout/execute" options={{ href: null }} />
      <Tabs.Screen name="workout/feedback" options={{ href: null }} />
      <Tabs.Screen name="workout/summary" options={{ href: null }} />
      <Tabs.Screen name="diet/summary" options={{ href: null }} />
      <Tabs.Screen name="assessment" options={{ href: null }} />
      <Tabs.Screen name="evolution" options={{ href: null }} />
      <Tabs.Screen name="questionnaires" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="blocked" options={{ href: null }} />
    </Tabs>
  )
}
