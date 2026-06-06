import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, FlatList, Dimensions,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

const { width } = Dimensions.get('window')
const PHOTO_W = (width - 48 - 12) / 2
const PHOTO_H = PHOTO_W * 1.4

const ANGLE_LABELS: Record<string, string> = {
  front: 'Frente', left: 'Lado esq.', right: 'Lado dir.', back: 'Costas',
}
const ANGLE_ORDER = ['front', 'left', 'right', 'back']

interface AssessmentPhoto { id: string; angle: string; photo_url: string }
interface Assessment {
  id: string; weight: number; height: number | null; body_fat_pct: number | null
  notes: string | null; created_at: string; photos: AssessmentPhoto[]
}

type PickerSide = 'left' | 'right'

export default function CompareAssessments() {
  const { id: studentId, name: studentName } = useLocalSearchParams<{ id: string; name: string }>()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerSide, setPickerSide] = useState<PickerSide>('left')

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase
      .from('assessments')
      .select(`id, weight, height, body_fat_pct, notes, created_at,
        photos:assessment_photos(id, angle, photo_url)`)
      .eq('student_id', studentId)
      .order('created_at', { ascending: true })
    const list = (data as Assessment[]) || []
    setAssessments(list)
    if (list.length >= 2) {
      setLeftId(list[0].id)
      setRightId(list[list.length - 1].id)
    } else if (list.length === 1) {
      setLeftId(list[0].id)
    }
    setLoading(false)
  }

  const left = assessments.find(a => a.id === leftId) ?? null
  const right = assessments.find(a => a.id === rightId) ?? null

  const openPicker = (side: PickerSide) => {
    setPickerSide(side)
    setPickerVisible(true)
  }

  const selectAssessment = (id: string) => {
    if (pickerSide === 'left') setLeftId(id)
    else setRightId(id)
    setPickerVisible(false)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null) return null
    return b - a
  }

  const deltaLabel = (d: number | null, unit: string) => {
    if (d == null) return '—'
    const sign = d > 0 ? '+' : ''
    return `${sign}${d.toFixed(1)}${unit}`
  }

  const deltaColor = (d: number | null, positiveIsGood = false) => {
    if (d == null) return colors.subtext
    if (d === 0) return colors.subtext
    const isPositive = d > 0
    return isPositive === positiveIsGood ? '#4CAF50' : colors.warning
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  if (assessments.length < 2) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Comparar Avaliações</Text>
            <Text style={s.pageSub}>{studentName}</Text>
          </View>
        </View>
        <View style={s.center}>
          <Ionicons name="git-compare-outline" size={48} color={colors.border} />
          <Text style={s.emptyText}>São necessárias ao menos 2 avaliações para comparar.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Comparar Avaliações</Text>
          <Text style={s.pageSub}>{studentName}</Text>
        </View>
      </View>

      {/* Seletores de data */}
      <View style={s.selectors}>
        <TouchableOpacity style={s.selector} onPress={() => openPicker('left')}>
          <Text style={s.selectorLabel}>ANTES</Text>
          <Text style={s.selectorDate}>{left ? formatDate(left.created_at) : '—'}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <View style={s.vsCircle}>
          <Text style={s.vsText}>VS</Text>
        </View>
        <TouchableOpacity style={s.selector} onPress={() => openPicker('right')}>
          <Text style={s.selectorLabel}>DEPOIS</Text>
          <Text style={s.selectorDate}>{right ? formatDate(right.created_at) : '—'}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Métricas */}
        {left && right && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Métricas</Text>
            <MetricRow
              label="Peso"
              before={left.weight}
              after={right.weight}
              unit="kg"
              d={delta(left.weight, right.weight)}
              positiveIsGood={false}
              deltaColor={deltaColor}
              deltaLabel={deltaLabel}
            />
            {(left.body_fat_pct != null || right.body_fat_pct != null) && (
              <MetricRow
                label="% Gordura"
                before={left.body_fat_pct}
                after={right.body_fat_pct}
                unit="%"
                d={delta(left.body_fat_pct, right.body_fat_pct)}
                positiveIsGood={false}
                deltaColor={deltaColor}
                deltaLabel={deltaLabel}
              />
            )}
          </View>
        )}

        {/* Fotos lado a lado */}
        {left && right && ANGLE_ORDER.map(angle => {
          const lPhoto = left.photos.find(p => p.angle === angle)
          const rPhoto = right.photos.find(p => p.angle === angle)
          if (!lPhoto && !rPhoto) return null
          return (
            <View key={angle} style={s.card}>
              <Text style={s.cardTitle}>{ANGLE_LABELS[angle] || angle}</Text>
              <View style={s.photoRow}>
                <View style={s.photoCol}>
                  {lPhoto
                    ? <Image source={{ uri: lPhoto.photo_url }} style={s.photo} resizeMode="cover" />
                    : <View style={[s.photo, s.photoEmpty]}><Ionicons name="image-outline" size={28} color={colors.border} /></View>
                  }
                  <Text style={s.photoDateLabel}>{formatDate(left.created_at)}</Text>
                </View>
                <View style={s.photoCol}>
                  {rPhoto
                    ? <Image source={{ uri: rPhoto.photo_url }} style={s.photo} resizeMode="cover" />
                    : <View style={[s.photo, s.photoEmpty]}><Ionicons name="image-outline" size={28} color={colors.border} /></View>
                  }
                  <Text style={s.photoDateLabel}>{formatDate(right.created_at)}</Text>
                </View>
              </View>
            </View>
          )
        })}

        {/* Observações */}
        {left && right && (left.notes || right.notes) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Observações</Text>
            <View style={s.notesRow}>
              <View style={s.notesCol}>
                <Text style={s.notesDate}>{formatDate(left.created_at)}</Text>
                <Text style={s.notesText}>{left.notes || '—'}</Text>
              </View>
              <View style={s.notesDivider} />
              <View style={s.notesCol}>
                <Text style={s.notesDate}>{formatDate(right.created_at)}</Text>
                <Text style={s.notesText}>{right.notes || '—'}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal de seleção */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerVisible(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>
            Selecionar avaliação — {pickerSide === 'left' ? 'Antes' : 'Depois'}
          </Text>
          <FlatList
            data={assessments}
            keyExtractor={a => a.id}
            renderItem={({ item }) => {
              const isSelected = pickerSide === 'left' ? item.id === leftId : item.id === rightId
              const isOtherSide = pickerSide === 'left' ? item.id === rightId : item.id === leftId
              return (
                <TouchableOpacity
                  style={[s.sheetItem, isSelected && s.sheetItemSelected, isOtherSide && s.sheetItemDisabled]}
                  onPress={() => !isOtherSide && selectAssessment(item.id)}
                  disabled={isOtherSide}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sheetItemDate, isSelected && s.sheetItemDateSelected]}>
                      {formatDate(item.created_at)}
                    </Text>
                    <Text style={s.sheetItemMetrics}>
                      {item.weight}kg{item.body_fat_pct != null ? ` · ${item.body_fat_pct}% BF` : ''}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.yellow} />}
                </TouchableOpacity>
              )
            }}
          />
        </View>
      </Modal>
    </View>
  )
}

function MetricRow({ label, before, after, unit, d, positiveIsGood, deltaColor, deltaLabel }: {
  label: string
  before: number | null
  after: number | null
  unit: string
  d: number | null
  positiveIsGood: boolean
  deltaColor: (d: number | null, pos: boolean) => string
  deltaLabel: (d: number | null, unit: string) => string
}) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.metricValues}>
        <Text style={s.metricVal}>{before != null ? `${before}${unit}` : '—'}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.subtext} />
        <Text style={s.metricVal}>{after != null ? `${after}${unit}` : '—'}</Text>
        <View style={[s.deltaBadge, { backgroundColor: `${deltaColor(d, positiveIsGood)}22` }]}>
          <Text style={[s.deltaText, { color: deltaColor(d, positiveIsGood) }]}>
            {deltaLabel(d, unit)}
          </Text>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.dark, padding: 40 },
  emptyText: { color: colors.subtext, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  pageSub: { fontSize: 12, color: colors.subtext },
  selectors: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  selector: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 12,
  },
  selectorLabel: { fontSize: 10, color: colors.subtext, fontWeight: '700', letterSpacing: 1 },
  selectorDate: { fontSize: 13, color: colors.text, fontWeight: '700' },
  vsCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${colors.yellow}22`, borderWidth: 1, borderColor: `${colors.yellow}44`,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 8,
  },
  vsText: { fontSize: 11, fontWeight: '900', color: colors.yellow },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { fontSize: 14, color: colors.subtext, flex: 1 },
  metricValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricVal: { fontSize: 15, color: colors.text, fontWeight: '700' },
  deltaBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  deltaText: { fontSize: 13, fontWeight: '700' },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoCol: { flex: 1, alignItems: 'center', gap: 6 },
  photo: { width: PHOTO_W, height: PHOTO_H, borderRadius: 10 },
  photoEmpty: {
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  photoDateLabel: { fontSize: 11, color: colors.subtext },
  notesRow: { flexDirection: 'row' },
  notesCol: { flex: 1, gap: 6 },
  notesDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 12 },
  notesDate: { fontSize: 11, color: colors.yellow, fontWeight: '700' },
  notesText: { fontSize: 13, color: colors.subtext, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%', paddingBottom: 32,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: colors.text, paddingHorizontal: 20, paddingBottom: 12 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetItemSelected: { backgroundColor: `${colors.yellow}10` },
  sheetItemDisabled: { opacity: 0.3 },
  sheetItemDate: { fontSize: 14, color: colors.text, fontWeight: '600' },
  sheetItemDateSelected: { color: colors.yellow },
  sheetItemMetrics: { fontSize: 12, color: colors.subtext, marginTop: 2 },
})
