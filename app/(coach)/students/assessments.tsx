import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

interface AssessmentPhoto { id: string; angle: string; photo_url: string }
interface Assessment {
  id: string; weight: number; height: number | null; body_fat_pct: number | null
  notes: string | null; read_by_coach: boolean; created_at: string
  photos: AssessmentPhoto[]
}

export default function CoachAssessments() {
  const { id: studentId, name: studentName } = useLocalSearchParams<{ id: string; name: string }>()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [studentId])

  const load = async () => {
    const { data } = await supabase
      .from('assessments')
      .select(`id, weight, height, body_fat_pct, notes, read_by_coach, created_at,
        photos:assessment_photos(id, angle, photo_url)`)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    setAssessments((data as any) || [])
    setLoading(false)

    const unread = (data || []).filter((a: any) => !a.read_by_coach).map((a: any) => a.id)
    if (unread.length > 0) {
      await supabase.from('assessments').update({ read_by_coach: true }).in('id', unread)
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
          <Text style={s.pageTitle}>Avaliações</Text>
          <Text style={s.pageSub}>{studentName}</Text>
        </View>
        {assessments.length >= 2 && (
          <TouchableOpacity
            style={s.compareBtn}
            onPress={() => router.push({ pathname: '/(coach)/students/compare', params: { id: studentId, name: studentName } })}
          >
            <Ionicons name="git-compare-outline" size={16} color={colors.yellow} />
            <Text style={s.compareBtnText}>Comparar</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {assessments.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="camera-outline" size={40} color={colors.subtext} />
            <Text style={s.emptyText}>Nenhuma avaliação registrada.</Text>
          </View>
        ) : (
          assessments.map(a => (
            <TouchableOpacity key={a.id} style={s.card} activeOpacity={0.8}
              onPress={() => setExpanded(expanded === a.id ? null : a.id)}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardDate}>
                    {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </Text>
                  <View style={s.metricsRow}>
                    <Text style={s.metric}>{a.weight}kg</Text>
                    {a.height != null && <Text style={s.metric}>{a.height}cm</Text>}
                    {a.body_fat_pct != null && <Text style={s.metric}>{a.body_fat_pct}% BF</Text>}
                  </View>
                </View>
                <View style={s.cardRight}>
                  {!a.read_by_coach && <View style={s.unreadDot} />}
                  <Ionicons name={expanded === a.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.subtext} />
                </View>
              </View>

              {expanded === a.id && (
                <View style={s.expanded}>
                  {a.notes ? <Text style={s.notes}>{a.notes}</Text> : null}
                  {a.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {a.photos.map(p => (
                        <View key={p.id} style={s.photoWrap}>
                          <Image source={{ uri: p.photo_url }} style={s.photo} resizeMode="cover" />
                          <Text style={s.photoAngle}>{p.angle}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  {a.photos.length === 0 && !a.notes && (
                    <Text style={s.noDetail}>Sem fotos ou observações.</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
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
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: `${colors.yellow}15`, borderWidth: 1, borderColor: `${colors.yellow}30`,
  },
  compareBtnText: { fontSize: 12, fontWeight: '700', color: colors.yellow },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: colors.subtext, fontSize: 14 },
  card: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardDate: { fontSize: 14, fontWeight: '700', color: colors.text },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  metric: { fontSize: 14, color: colors.yellow, fontWeight: '700' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  expanded: { gap: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  notes: { fontSize: 13, color: colors.subtext, lineHeight: 18 },
  photoWrap: { marginRight: 10, alignItems: 'center' },
  photo: { width: 120, height: 160, borderRadius: 10, backgroundColor: colors.border },
  photoAngle: { fontSize: 10, color: colors.subtext, marginTop: 4, textTransform: 'capitalize' },
  noDetail: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
})
