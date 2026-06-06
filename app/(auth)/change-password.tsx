import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

export default function ChangePasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const { changePassword, signOut, user } = useAuthStore()
  const insets = useSafeAreaInsets()

  const handleChange = async () => {
    if (password.length < 8) {
      Alert.alert('Senha fraca', 'A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      Alert.alert('Senhas diferentes', 'As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const isFirstEverLogin = !user?.anamnese_completed
      await changePassword(password)
      if (isFirstEverLogin && session?.user?.id) {
        supabase.functions.invoke('send-welcome-message', {
          body: { student_user_id: session.user.id },
        })
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📸 Faça sua primeira avaliação!',
            body: 'Envie suas fotos para o seu coach iniciar seu acompanhamento.',
            sound: true,
            data: { screen: '/(student)/assessments' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'default' },
        })
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={[styles.inner, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Primeiro acesso</Text>
          </View>
          <Text style={styles.title}>Crie sua senha</Text>
          <Text style={styles.desc}>
            Por segurança, defina uma senha pessoal para acessar o app.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={colors.subtext}
              secureTextEntry
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>Confirmar senha</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repita a senha"
              placeholderTextColor={colors.subtext}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleChange}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={styles.btnText}>CONFIRMAR</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 40,
  },
  header: { gap: 12 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.yellow}22`,
    borderWidth: 1,
    borderColor: `${colors.yellow}44`,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, color: colors.yellow, fontWeight: '600', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  desc: { fontSize: 14, color: colors.subtext, lineHeight: 22 },
  form: { gap: 16 },
  inputWrap: { gap: 6 },
  label: { fontSize: 12, color: colors.subtext, letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  btn: {
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
  logoutBtn: { alignItems: 'center', paddingVertical: 8 },
  logoutText: { fontSize: 14, color: colors.subtext },
})
