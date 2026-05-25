import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

export default function CoachMobileLayout() {
  const { user } = useAuthStore()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetchUnread()

    const channel = supabase
      .channel('coach-tab-unread')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user!.id}`,
      }, () => fetchUnread())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user!.id}`,
      }, () => fetchUnread())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchUnread = async () => {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user!.id)
      .is('read_at', null)
    setUnread(count || 0)
  }

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingBottom: 8 },
      tabBarActiveTintColor: colors.yellow,
      tabBarInactiveTintColor: colors.subtext,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
    }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="students/index"
        options={{
          title: 'Alunos',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.yellow, color: '#0A0A0A', fontSize: 9, fontWeight: '800', minWidth: 16, height: 16, lineHeight: 16 },
        }}
      />
      <Tabs.Screen name="students/[id]" options={{ href: null }} />
    </Tabs>
  )
}
