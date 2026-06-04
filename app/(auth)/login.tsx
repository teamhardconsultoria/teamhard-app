import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { colors, font } from '@/lib/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuthStore()
  const [resetLoading, setResetLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const insets = useSafeAreaInsets()

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (err: any) {
      Alert.alert('Erro ao entrar', err.message || 'Verifique suas credenciais.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={[styles.inner, { paddingBottom: Math.max(40, insets.bottom + 16) }]}>
        {/* Logo / Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/logo.jpeg')}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.subtext}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.subtext}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotWrap}
            disabled={resetLoading}
            onPress={async () => {
              const trimmed = email.trim().toLowerCase()
              if (!trimmed) {
                Alert.alert('Informe o e-mail', 'Preencha o campo de e-mail acima antes de redefinir a senha.')
                return
              }
              setResetLoading(true)
              const { error } = await supabase.auth.resetPasswordForEmail(trimmed)
              setResetLoading(false)
              if (error) {
                Alert.alert('Erro', error.message)
              } else {
                Alert.alert('E-mail enviado', 'Verifique sua caixa de entrada e siga as instruções para criar uma nova senha.')
              }
            }}
          >
            <Text style={[styles.forgot, resetLoading && { opacity: 0.5 }]}>
              {resetLoading ? 'Enviando...' : 'Esqueci minha senha'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={styles.btnText}>ENTRAR</Text>
            }
          </TouchableOpacity>

        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={() => Linking.openURL('https://teamhardconsultoria.github.io')}
        >
          <Text style={styles.ctaText}>Ainda não é aluno?</Text>
          <Text style={styles.ctaLink}>Entre já para o Team Hard</Text>
          <Text style={styles.ctaUrl}>teamhardconsultoria.github.io</Text>
        </TouchableOpacity>
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
    paddingBottom: 40,
  },
  header: { alignItems: 'center', marginBottom: 48 },
  logoImg: { width: 220, height: 110 },
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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  forgotWrap: { alignSelf: 'flex-end' },
  forgot: { fontSize: 13, color: colors.yellow },
  btn: {
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
  cta: { alignItems: 'center', marginTop: 40, gap: 4 },
  ctaText: { fontSize: 13, color: '#555' },
  ctaLink: { fontSize: 14, fontWeight: '700', color: colors.yellow },
  ctaUrl: { fontSize: 12, color: '#555' },
})
