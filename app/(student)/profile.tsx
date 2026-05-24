import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore()

  const handleSignOut = async () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.menu}>
        <MenuItem icon="person-outline" label="Editar Anamnese" onPress={() => router.push('/onboarding/anamnese')} />
        <MenuItem icon="camera-outline" label="Enviar Avaliação" onPress={() => router.push('/(student)/assessment')} />
        <MenuItem icon="trending-up-outline" label="Minha Evolução" onPress={() => router.push('/(student)/evolution')} />
        <MenuItem icon="notifications-outline" label="Notificações" onPress={() => {}} />
        <MenuItem icon="lock-closed-outline" label="Alterar Senha" onPress={() => router.push('/(auth)/change-password')} />
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color={colors.error} />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </View>
  )
}

function MenuItem({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.subtext} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, paddingTop: 60 },
  header: { alignItems: 'center', padding: 32, gap: 8 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#0A0A0A' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  email: { fontSize: 14, color: colors.subtext },
  menu: { borderTopWidth: 1, borderTopColor: colors.border },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: `${colors.error}44`,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: `${colors.error}11`,
  },
  logoutText: { fontSize: 15, color: colors.error, fontWeight: '700' },
})
