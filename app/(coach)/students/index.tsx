import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Student {
  id: string
  name: string
  email: string
  payment_status: string
  plan_end: string | null
  assessmentCount: number
}

export default function CoachStudentsMobile() {
  const { user } = useAuthStore()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const { data: coach } = await supabase
      .from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); setRefreshing(false); return }

    const { data } = await supabase
      .from('students')
      .select('id, payment_status, plan_end, user:users(id, name, email)')
      .eq('coach_id', coach.id)
      .order('created_at', { ascending: false })

    const list: Student[] = await Promise.all(
      (data || []).map(async (s: any) => {
        const { count } = await supabase
          .from('assessments')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', s.id)

        return {
          id: s.id,
          name: s.user.name,
          email: s.user.email,
          payment_status: s.payment_status,
          plan_end: s.plan_end,
          assessmentCount: count || 0,
        }
      })
    )

    setStudents(list)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const onRefresh = async () => { setRefreshing(true); await load() }

  const statusColor = (s: string) => {
    if (s === 'active') return '#4CAF50'
    if (s === 'overdue') return '#FF9800'
    return colors.subtext
  }

  const statusLabel = (s: string) => {
    if (s === 'active') return 'Ativo'
    if (s === 'overdue') return 'Em atraso'
    if (s === 'inactive') return 'Inativo'
    return s
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Alunos</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{students.length}</Text>
        </View>
      </View>

      {students.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Nenhum aluno cadastrado.</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={s => s.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.yellow} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/(coach)/students/[id]', params: { id: item.id, name: item.name } })}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.email}>{item.email}</Text>
                  <View style={styles.meta}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor(item.payment_status) }]} />
                    <Text style={[styles.statusText, { color: statusColor(item.payment_status) }]}>
                      {statusLabel(item.payment_status)}
                    </Text>
                    {item.assessmentCount > 0 && (
                      <Text style={styles.metaSep}>
                        {'  ·  '}{item.assessmentCount} avaliação{item.assessmentCount !== 1 ? 'ões' : ''}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.subtext, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  countBadge: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 2,
  },
  countText: { fontSize: 12, fontWeight: '700', color: colors.subtext },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 14,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  email: { fontSize: 12, color: colors.subtext, marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  metaSep: { fontSize: 11, color: colors.subtext },
})
