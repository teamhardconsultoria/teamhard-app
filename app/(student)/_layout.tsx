import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

export default function StudentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
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
    </Tabs>
  )
}
