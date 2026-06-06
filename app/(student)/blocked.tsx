import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

export default function BlockedScreen() {
  const { signOut, user } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [coachPhone, setCoachPhone] = useState<string | null>(null)
  const [coachName, setCoachName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCoach = async () => {
      const { data: student } = await supabase
        .from('students')
        .select('coach_id')
        .eq('user_id', user!.id)
        .single()

      if (!student) { setLoading(false); return }

      const { data: coach } = await supabase
        .from('coaches')
        .select('user_id')
        .eq('id', student.coach_id)
        .single()

      if (!coach) { setLoading(false); return }

      const { data: coachUser } = await supabase
        .from('users')
        .select('name, phone')
        .eq('id', coach.user_id)
        .single()

      setCoachPhone(coachUser?.phone || null)
      setCoachName(coachUser?.name || null)
      setLoading(false)
    }
    fetchCoach()
  }, [])

  const openWhatsApp = () => {
    if (!coachPhone) return
    const digits = coachPhone.replace(/\D/g, '')
    Linking.openURL(`https://wa.me/${digits}`)
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={48} color={colors.yellow} />
      </View>

      <Text style={styles.title}>Acesso suspenso</Text>
      <Text style={styles.desc}>
        Seu acesso foi suspenso por inadimplência. Entre em contato com seu coach para regularizar e reativar sua conta.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.yellow} style={{ marginTop: 8 }} />
      ) : coachPhone ? (
        <TouchableOpacity style={styles.btn} onPress={openWhatsApp} activeOpacity={0.8}>
          <Ionicons name="logo-whatsapp" size={18} color="#0A0A0A" />
          <Text style={styles.btnText}>
            FALAR COM {coachName ? coachName.split(' ')[0].toUpperCase() : 'O COACH'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.noPhone}>
          <Ionicons name="information-circle-outline" size={16} color={colors.subtext} />
          <Text style={styles.noPhoneText}>Entre em contato com seu coach para reativar o acesso.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: `${colors.yellow}15`,
    borderWidth: 2, borderColor: `${colors.yellow}30`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '900', color: colors.text, textAlign: 'center' },
  desc: {
    fontSize: 15, color: colors.subtext, textAlign: 'center',
    lineHeight: 24, maxWidth: 300,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.yellow, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 28,
    marginTop: 8,
  },
  btnText: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },
  noPhone: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginTop: 8,
  },
  noPhoneText: { fontSize: 13, color: colors.subtext, flex: 1 },
  logoutBtn: { paddingVertical: 8 },
  logoutText: { fontSize: 14, color: colors.subtext },
})
