import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { Workout, Diet, Message, Assessment } from '@/types'

interface HomeData {
  workout: Workout | null
  diet: Diet | null
  unreadMessages: number
  lastAssessment: Assessment | null
  pendingQuestionnaires: number
  studentStatus: { payment_status: string; plan_end: string } | null
}

export default function HomeScreen() {
  const { user } = useAuthStore()
  const [data, setData] = useState<HomeData>({
    workout: null, diet: null, unreadMessages: 0,
    lastAssessment: null, pendingQuestionnaires: 0, studentStatus: null,
  })
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, payment_status, plan_end')
        .eq('user_id', user!.id)
        .single()

      if (studentErr) { Alert.alert('Erro (student)', studentErr.message); return }
      if (!student) { Alert.alert('Erro', 'Aluno não encontrado no banco.'); return }

      const [workoutRes, dietRes, msgRes, assessRes, questRes] = await Promise.all([
        supabase.from('workouts').select('*, days:workout_days(*)').eq('student_id', student.id).eq('active', true).lte('valid_from', today).gte('valid_to', today).maybeSingle(),
        supabase.from('diets').select('*, days:diet_days(*)').eq('student_id', student.id).eq('active', true).lte('valid_from', today).gte('valid_to', today).maybeSingle(),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('student_id', student.id).eq('sender_role', 'coach').is('read_at', null),
        supabase.from('assessments').select('*').eq('student_id', student.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('questionnaire_assignments').select('id', { count: 'exact', head: true }).eq('student_id', student.id),
      ])

      setData({
        workout: workoutRes.data,
        diet: dietRes.data,
        unreadMessages: msgRes.count || 0,
        lastAssessment: assessRes.data,
        pendingQuestionnaires: questRes.count || 0,
        studentStatus: { payment_status: student.payment_status, plan_end: student.plan_end },
      })
    } catch (e: any) {
      Alert.alert('Erro home', e?.message || String(e))
    }
  }

  useEffect(() => { fetchData() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const todayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long' })
  const todayDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.yellow} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.date}>{todayName.charAt(0).toUpperCase() + todayName.slice(1)}, {todayDate}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(student)/profile')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Status do plano */}
      {data.studentStatus?.payment_status === 'overdue' && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={16} color="#FF9800" />
          <Text style={styles.warningText}>
            Pagamento pendente. Acesso bloqueado em breve.
          </Text>
        </View>
      )}

      {/* Card de Treino do Dia */}
      <SectionCard
        icon="barbell"
        title="Treino de Hoje"
        onPress={() => router.push('/(student)/workout/')}
      >
        {data.workout ? (
          <View>
            <Text style={styles.cardValue}>{data.workout.name}</Text>
            <Text style={styles.cardSub}>
              Válido até {new Date(data.workout.valid_to).toLocaleDateString('pt-BR')}
            </Text>
          </View>
        ) : (
          <Text style={styles.cardEmpty}>Nenhum treino ativo</Text>
        )}
      </SectionCard>

      {/* Card de Dieta */}
      <SectionCard
        icon="nutrition"
        title="Dieta do Dia"
        onPress={() => router.push('/(student)/diet/')}
      >
        {data.diet ? (
          <Text style={styles.cardValue}>{data.diet.name}</Text>
        ) : (
          <Text style={styles.cardEmpty}>Nenhuma dieta ativa</Text>
        )}
      </SectionCard>

      {/* Grid de atalhos */}
      <View style={styles.grid}>
        <QuickLink
          icon="chatbubble"
          label="Chat"
          badge={data.unreadMessages}
          onPress={() => router.push('/(student)/chat')}
        />
        <QuickLink
          icon="camera"
          label="Avaliação"
          onPress={() => router.push('/(student)/assessment')}
        />
        <QuickLink
          icon="trending-up"
          label="Evolução"
          onPress={() => router.push('/(student)/evolution')}
        />
        <QuickLink
          icon="clipboard"
          label="Questionários"
          badge={data.pendingQuestionnaires}
          onPress={() => router.push('/(student)/questionnaires')}
        />
      </View>

      {/* Última avaliação */}
      {data.lastAssessment && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Última avaliação</Text>
          <View style={styles.infoRow}>
            <InfoStat label="Peso" value={`${data.lastAssessment.weight} kg`} />
            {data.lastAssessment.body_fat_pct && (
              <InfoStat label="% Gordura" value={`${data.lastAssessment.body_fat_pct}%`} />
            )}
            <InfoStat label="Data" value={new Date(data.lastAssessment.created_at).toLocaleDateString('pt-BR')} />
          </View>
        </View>
      )}
    </ScrollView>
  )
}

function SectionCard({ icon, title, children, onPress }: any) {
  return (
    <TouchableOpacity style={styles.sectionCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.sectionCardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={colors.yellow} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </TouchableOpacity>
  )
}

function QuickLink({ icon, label, badge, onPress }: any) {
  return (
    <TouchableOpacity style={styles.quickLink} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.quickLinkIcon}>
        <Ionicons name={icon} size={22} color={colors.yellow} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  content: { padding: 24, paddingTop: 60, paddingBottom: 32, gap: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.text },
  date: { fontSize: 13, color: colors.subtext, marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF980011',
    borderWidth: 1,
    borderColor: '#FF980044',
    borderRadius: 10,
    padding: 12,
  },
  warningText: { fontSize: 13, color: '#FF9800', flex: 1 },
  sectionCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: `${colors.yellow}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  sectionContent: {},
  cardValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 12, color: colors.subtext, marginTop: 4 },
  cardEmpty: { fontSize: 14, color: colors.subtext },
  grid: { flexDirection: 'row', gap: 12 },
  quickLink: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickLinkIcon: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: colors.yellow,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#0A0A0A' },
  quickLinkLabel: { fontSize: 11, color: colors.subtext, fontWeight: '600', textAlign: 'center' },
  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.subtext, textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', gap: 24 },
  stat: { gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.subtext },
})
