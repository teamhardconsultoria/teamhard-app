import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import * as ImagePicker from 'expo-image-picker'
import Constants from 'expo-constants'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuthStore()
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifStatus(status as any)
    })
  }, [])

  const handleSignOut = async () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  const handleNotifications = async () => {
    if (notifStatus === 'granted') {
      Alert.alert('Notificações ativas', 'Você já está recebendo notificações do Método Acelera!.')
      return
    }

    const { status, canAskAgain } = await Notifications.requestPermissionsAsync()
    setNotifStatus(status as any)

    if (status === 'granted') {
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId && projectId !== 'SEU_EAS_PROJECT_ID' ? { projectId } : undefined
        )
        await supabase.from('users').update({ push_token: tokenData.data }).eq('id', user!.id)
      } catch {}
      Alert.alert('Notificações ativadas!', 'Você receberá alertas de mensagens e novidades do coach.')
    } else if (!canAskAgain) {
      Alert.alert(
        'Permissão necessária',
        'Ative as notificações nas configurações do seu celular para receber alertas do Método Acelera!.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
        ]
      )
    }
  }

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações do celular.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })

    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const response = await fetch(uri)
      const blob = await response.blob()

      const path = `${user!.id}/profile.jpg`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

      await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user!.id)
      setUser({ ...user!, avatar_url: avatarUrl })
    } catch (e: any) {
      Alert.alert('Erro ao enviar foto', e?.message || String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8} style={styles.avatarWrap}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.cameraOverlay}>
            {uploading
              ? <ActivityIndicator size="small" color="#0A0A0A" />
              : <Ionicons name="camera" size={14} color="#0A0A0A" />
            }
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.menu}>
        <MenuItem icon="person-outline" label="Editar Anamnese" onPress={() => router.push('/onboarding/anamnese')} />
        <MenuItem icon="camera-outline" label="Enviar Avaliação" onPress={() => router.push('/(student)/assessment')} />
        <MenuItem icon="trending-up-outline" label="Minha Evolução" onPress={() => router.push('/(student)/evolution')} />
        <MenuItem
          icon={notifStatus === 'granted' ? 'notifications' : 'notifications-outline'}
          label={notifStatus === 'granted' ? 'Notificações ativas' : 'Ativar Notificações'}
          onPress={handleNotifications}
        />
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
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#0A0A0A' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark,
  },
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
