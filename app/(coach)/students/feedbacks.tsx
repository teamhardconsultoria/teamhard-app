import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

const FATIGUE_LABEL = ['', 'Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto']
const FATIGUE_COLOR = ['', colors.success, colors.success, colors.warning, colors.error, colors.error]

interface Feedback {
  id: string
  fatigue_level: number
  has_pain: boolean
  pain_description: string | null
  notes: string | null
  difficult_exercise_notes: string | null
  read_by_coach: boolean
  created_at: string
  session: { started_at: string; workout_day: { name: string; workout: { name: string } } | null } | null
  difficult_exercise: { name: string } | null
}

export default function CoachFeedbacks() {
  const { id: studentId, name: studentName } = useLocalSearchParams<{ id: string; name: string }>()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [studentId])

  const load = async () => {
    const { data } = await supabase
      .from('training_feedbacks')
      .select(`id, fatigue_level, has_pain, pain_description, notes, difficult_exercise_notes, read_by_coach, created_at,
        session:training_sessions(started_at,
          workout_day:workout_days(name, workout:workouts(name))),
        difficult_exercise:exercises(name)`)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    setFeedbacks((data as any) || [])
    setLoading(false)

    const unread = (data || []).filter((f: any) => !f.read_by_coach).map((f: any) => f.id)
    if (unread.length > 0) {
      await supabase.from('training_feedbacks').update({ read_by_coach: true }).in('id', unread)
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Feedbacks</Text>
          <Text style={s.pageSub}>{studentName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {feedbacks.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="star-outline" size={40} color={colors.subtext} />
            <Text style={s.emptyText}>Nenhum feedback registrado.</Text>
          </View>
        ) : (
          feedbacks.map(f => {
            const color = FATIGUE_COLOR[f.fatigue_level] || colors.subtext
            const workout = (f.session?.workout_day as any)
            return (
              <TouchableOpacity key={f.id} style={s.card} activeOpacity={0.8}
                onPress={() => setExpanded(expanded === f.id ? null : f.id)}>
                <View style={s.cardHeader}>
                  <View style={[s.fatigueBadge, { backgroundColor: color + '20' }]}>
                    <Ionicons name="flame" size={12} color={color} />
                    <Text style={[s.fatigueText, { color }]}>{FATIGUE_LABEL[f.fatigue_level]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardDate}>{new Date(f.created_at).toLocaleDateString('pt-BR')}</Text>
                    {workout?.workout?.name && (
                      <Text style={s.sessionInfo} numberOfLines={1}>
                        {workout.workout.name} · {workout.name}
                      </Text>
                    )}
                  </View>
                  <View style={s.cardRight}>
                    {!f.read_by_coach && <View style={s.unreadDot} />}
                    {f.has_pain && <Ionicons name="alert-circle" size={14} color={colors.error} />}
                    <Ionicons name={expanded === f.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.subtext} />
                  </View>
                </View>

                {expanded === f.id && (
                  <View style={s.expanded}>
                    {f.has_pain && (
                      <View style={s.painBox}>
                        <Ionicons name="alert-circle" size={14} color={colors.error} />
                        <Text style={s.painText}>{f.pain_description || 'Dor reportada'}</Text>
                      </View>
                    )}
                    {f.difficult_exercise && (
                      <Text style={s.detail}>
                        <Text style={s.detailLabel}>Exercício difícil: </Text>
                        {f.difficult_exercise.name}
                        {f.difficult_exercise_notes ? ` — ${f.difficult_exercise_notes}` : ''}
                      </Text>
                    )}
                    {f.notes && (
                      <Text style={s.detail}>
                        <Text style={s.detailLabel}>Observações: </Text>
                        {f.notes}
                      </Text>
                    )}
                    {!f.has_pain && !f.difficult_exercise && !f.notes && (
                      <Text style={s.noDetail}>Sem observações adicionais.</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </View>
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
  pageTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  pageSub: { fontSize: 12, color: colors.subtext },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: colors.subtext, fontSize: 14 },
  card: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fatigueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  fatigueText: { fontSize: 11, fontWeight: '700' },
  cardDate: { fontSize: 13, fontWeight: '700', color: colors.text },
  sessionInfo: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  expanded: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  painBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: colors.error + '15', borderRadius: 8, padding: 10 },
  painText: { fontSize: 13, color: colors.error, flex: 1 },
  detail: { fontSize: 13, color: colors.subtext, lineHeight: 18 },
  detailLabel: { fontWeight: '700', color: colors.text },
  noDetail: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
})
