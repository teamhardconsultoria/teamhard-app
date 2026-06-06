import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

const STATUS_LABEL: Record<string, string> = {
  active: 'Em dia', pending: 'Pendente', overdue: 'Vencido', blocked: 'Bloqueado',
}
const STATUS_COLOR: Record<string, string> = {
  active: colors.success, pending: colors.warning, overdue: colors.error, blocked: colors.error,
}

export default function StudentHub() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>()
  const [student, setStudent] = useState<any>(null)
  const [counts, setCounts] = useState({ feedbacks: 0, assessments: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  const load = async () => {
    const [studentRes, feedbackRes, assessRes] = await Promise.all([
      supabase.from('students')
        .select('id, payment_status, plan_end, plan_type, user:users(name, email)')
        .eq('id', id).single(),
      supabase.from('training_feedbacks')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', id).eq('read_by_coach', false),
      supabase.from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', id).eq('read_by_coach', false),
    ])
    setStudent(studentRes.data)
    setCounts({ feedbacks: feedbackRes.count || 0, assessments: assessRes.count || 0 })
    setLoading(false)
  }

  const studentName = (student?.user as any)?.name || name || '?'
  const planEnd = student?.plan_end ? new Date(student.plan_end) : null
  const daysLeft = planEnd ? Math.ceil((planEnd.getTime() - Date.now()) / 86400000) : null
  const status = student?.payment_status || 'active'

  const go = (sub: string) =>
    router.push({ pathname: `/(coach)/students/${sub}` as any, params: { id, name: studentName } })

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{studentName.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{studentName}</Text>
          <Text style={s.headerEmail} numberOfLines={1}>{(student?.user as any)?.email}</Text>
        </View>
        <TouchableOpacity style={s.chatBtn} onPress={() => router.push('/(coach)/chat')}>
          <Ionicons name="chatbubble" size={18} color={colors.yellow} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Status card */}
        <View style={s.statusCard}>
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[status] || colors.subtext }]} />
            <Text style={[s.statusText, { color: STATUS_COLOR[status] || colors.subtext }]}>
              {STATUS_LABEL[status] || status}
            </Text>
          </View>
          {planEnd && (
            <Text style={s.planEnd}>
              Plano até {planEnd.toLocaleDateString('pt-BR')}
              {daysLeft !== null && daysLeft <= 7 && (
                <Text style={{ color: colors.error }}>
                  {' '}({daysLeft <= 0 ? 'expirado' : `${daysLeft}d`})
                </Text>
              )}
            </Text>
          )}
        </View>

        {/* Menu */}
        <View style={s.menu}>
          <MenuItem icon="barbell" label="Treinos" sub="Montar e gerenciar treinos" onPress={() => go('workouts')} />
          <MenuItem icon="nutrition" label="Dieta" sub="Montar e gerenciar dietas" onPress={() => go('diets')} />
          <MenuItem icon="camera" label="Avaliações" sub="Fotos e medidas corporais"
            badge={counts.assessments} onPress={() => go('assessments')} />
          <MenuItem icon="star" label="Feedbacks" sub="Respostas após treinos"
            badge={counts.feedbacks} onPress={() => go('feedbacks')} />
        </View>
      </ScrollView>
    </View>
  )
}

function MenuItem({ icon, label, sub, badge, onPress }: {
  icon: string; label: string; sub: string; badge?: number; onPress: () => void
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={s.menuIcon}>
        <Ionicons name={icon as any} size={20} color={colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        <Text style={s.menuSub}>{sub}</Text>
      </View>
      {(badge ?? 0) > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge! > 9 ? '9+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  headerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  headerEmail: { fontSize: 11, color: colors.subtext },
  chatBtn: { padding: 10, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  statusCard: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  planEnd: { fontSize: 12, color: colors.subtext },
  menu: { gap: 8 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  menuIcon: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: colors.yellow + '18', alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  menuSub: { fontSize: 12, color: colors.subtext, marginTop: 1 },
  badge: {
    backgroundColor: colors.yellow, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#0A0A0A' },
})
