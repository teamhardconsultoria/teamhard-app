import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Stats {
  totalStudents: number
  activeStudents: number
  monthRevenue: number
  unreadFeedbacks: number
  unreadMessages: number
}

interface AlertItem {
  id: string
  name: string
  reason: string
  isError: boolean
}

export default function CoachDashboardMobile() {
  const { user, signOut } = useAuthStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); setRefreshing(false); return }

    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, payment_status, plan_end, user:users(name)')
      .eq('coach_id', coach.id)

    const list = students || []
    const studentIds = list.map(s => s.id)
    const studentUserIds = list.map(s => s.user_id)
    const none = ['none']

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const [paymentsRes, feedbacksRes, messagesRes] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'paid')
        .gte('paid_at', startOfMonth.toISOString())
        .in('student_id', studentIds.length ? studentIds : none),
      supabase.from('training_feedbacks').select('id', { count: 'exact', head: true })
        .eq('read_by_coach', false)
        .in('student_id', studentIds.length ? studentIds : none),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', user!.id)
        .in('sender_id', studentUserIds.length ? studentUserIds : none)
        .is('read_at', null),
    ])

    setStats({
      totalStudents: list.length,
      activeStudents: list.filter(s => s.payment_status === 'active').length,
      monthRevenue: paymentsRes.data?.reduce((s, p) => s + (p.amount || 0), 0) || 0,
      unreadFeedbacks: feedbacksRes.count || 0,
      unreadMessages: messagesRes.count || 0,
    })

    const alertList: AlertItem[] = []
    for (const s of list) {
      const planEnd = s.plan_end ? new Date(s.plan_end) : null
      const daysLeft = planEnd ? Math.ceil((planEnd.getTime() - Date.now()) / 86400000) : null
      const name = (s.user as any)?.name || '?'
      if (s.payment_status === 'blocked') alertList.push({ id: s.id, name, reason: 'Acesso bloqueado', isError: true })
      else if (s.payment_status === 'overdue') alertList.push({ id: s.id, name, reason: 'Pagamento vencido', isError: true })
      else if (daysLeft !== null && daysLeft <= 7)
        alertList.push({ id: s.id, name, reason: daysLeft <= 0 ? 'Plano expirado' : `Plano vence em ${daysLeft}d`, isError: daysLeft <= 0 })
    }
    setAlerts(alertList)
    setLoading(false)
    setRefreshing(false)
  }

  const onRefresh = () => { setRefreshing(true); load() }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} size="large" /></View>

  const firstName = user?.name?.split(' ')[0] || 'Coach'

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.yellow} />}>

      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Olá, {firstName} 👋</Text>
          <Text style={s.date}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={s.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      {/* Stats grid */}
      <View style={s.grid}>
        <StatCard icon="people" color={colors.yellow} label="Alunos" value={stats?.totalStudents ?? 0}
          sub={`${stats?.activeStudents ?? 0} ativos`} />
        <StatCard icon="cash" color={colors.success} label="Receita/mês"
          value={`R$ ${((stats?.monthRevenue ?? 0) / 1000).toFixed(1)}k`} />
        <StatCard icon="star" color={(stats?.unreadFeedbacks ?? 0) > 0 ? colors.warning : colors.yellow}
          label="Feedbacks" value={stats?.unreadFeedbacks ?? 0}
          alert={(stats?.unreadFeedbacks ?? 0) > 0}
          onPress={() => router.push('/(coach)/students/index')} />
        <StatCard icon="chatbubble" color={(stats?.unreadMessages ?? 0) > 0 ? colors.warning : colors.yellow}
          label="Mensagens" value={stats?.unreadMessages ?? 0}
          alert={(stats?.unreadMessages ?? 0) > 0}
          onPress={() => router.push('/(coach)/chat')} />
      </View>

      {/* Alertas */}
      <Text style={s.sectionLabel}>
        {alerts.length > 0 ? 'Requer Atenção' : 'Status'}
      </Text>

      {alerts.length === 0 ? (
        <View style={s.allGood}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={s.allGoodText}>Tudo em ordem!</Text>
        </View>
      ) : (
        <View style={s.alertList}>
          {alerts.slice(0, 6).map(a => (
            <TouchableOpacity key={a.id} style={s.alertRow} activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/(coach)/students/[id]', params: { id: a.id, name: a.name } })}>
              <Ionicons name="alert-circle" size={14} color={a.isError ? colors.error : colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertName}>{a.name}</Text>
                <Text style={[s.alertReason, { color: a.isError ? colors.error : colors.warning }]}>{a.reason}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick actions */}
      <Text style={[s.sectionLabel, { marginTop: 20 }]}>Ações Rápidas</Text>
      <View style={s.actions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/(coach)/students/index')} activeOpacity={0.7}>
          <Ionicons name="people" size={22} color={colors.yellow} />
          <Text style={s.actionLabel}>Ver Alunos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/(coach)/chat')} activeOpacity={0.7}>
          <Ionicons name="chatbubbles" size={22} color={colors.yellow} />
          <Text style={s.actionLabel}>Chat</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function StatCard({ icon, color, label, value, sub, alert, onPress }: {
  icon: string; color: string; label: string; value: string | number
  sub?: string; alert?: boolean; onPress?: () => void
}) {
  const Wrap: any = onPress ? TouchableOpacity : View
  return (
    <Wrap style={[s.statCard, alert && s.statAlert]} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </Wrap>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 22, fontWeight: '900', color: colors.text },
  date: { fontSize: 12, color: colors.subtext, marginTop: 2, textTransform: 'capitalize' },
  iconBtn: { padding: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: {
    width: '47.5%', backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4,
  },
  statAlert: { borderColor: colors.warning + '60' },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 11, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  statSub: { fontSize: 11, color: colors.subtext },
  sectionLabel: { fontSize: 11, color: colors.subtext, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  alertList: { gap: 8 },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
  },
  alertName: { fontSize: 14, fontWeight: '600', color: colors.text },
  alertReason: { fontSize: 12, marginTop: 1 },
  allGood: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  allGoodText: { fontSize: 14, color: colors.success, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16,
    alignItems: 'center', gap: 8,
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
})
