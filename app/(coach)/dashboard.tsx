import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'
import { useAuthStore } from '@/store/auth'

export default function CoachDashboardMobile() {
  const { signOut, user } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}><Text style={{ color: colors.yellow }}>TEAM</Text>HARD</Text>
        <Text style={styles.role}>Painel do Coach</Text>
      </View>

      <View style={styles.card}>
        <Ionicons name="desktop-outline" size={32} color={colors.yellow} />
        <Text style={styles.title}>Use o painel web</Text>
        <Text style={styles.sub}>Para uma experiência completa de coach, acesse pelo navegador no computador.</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.userName}>{user?.name}</Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.subtext} />
          <Text style={styles.signOutText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 32, paddingTop: 64 },
  header: { marginBottom: 48 },
  logo: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: 4 },
  role: { fontSize: 12, color: colors.subtext, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.subtext, textAlign: 'center', lineHeight: 22 },
  footer: { paddingTop: 24, alignItems: 'center', gap: 12 },
  userName: { fontSize: 13, color: colors.subtext },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  signOutText: { fontSize: 14, color: colors.subtext, fontWeight: '600' },
})
