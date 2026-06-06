import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, TouchableOpacity, Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path, Line, Circle, Text as SvgText, G } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

const SCREEN_W = Dimensions.get('window').width
const CHART_W = SCREEN_W - 48
const CHART_H = 160
const PAD = { top: 16, bottom: 28, left: 36, right: 12 }

interface AssessmentPhoto { id: string; angle: string; photo_url: string }

interface AssessmentPoint {
  id: string
  dateLabel: string
  weight: number
  imc: number
  bodyFat?: number
  photos: AssessmentPhoto[]
}

const ANGLE_ORDER = ['front', 'left', 'right', 'back']
const ANGLE_LABELS: Record<string, string> = {
  front: 'Frente', left: 'Esq.', right: 'Dir.', back: 'Costas',
}
const PHOTO_W = (Dimensions.get('window').width - 48 - 10) / 2

interface SessionPoint {
  month: string
  count: number
}

function buildLinePath(points: number[], w: number, h: number): string {
  if (points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => PAD.left + (i / (points.length - 1)) * (w - PAD.left - PAD.right))
  const ys = points.map(v => PAD.top + (1 - (v - min) / range) * (h - PAD.top - PAD.bottom))
  return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
}

function LineChartSVG({ data, color, labels }: { data: number[]; color: string; labels: string[] }) {
  if (data.length < 2) return (
    <View style={styles.chartEmpty}><Text style={styles.chartEmptyText}>Mínimo 2 avaliações para exibir o gráfico.</Text></View>
  )
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const xs = data.map((_, i) => PAD.left + (i / (data.length - 1)) * (CHART_W - PAD.left - PAD.right))
  const ys = data.map(v => PAD.top + (1 - (v - min) / range) * (CHART_H - PAD.top - PAD.bottom))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Grid lines */}
      {[0, 0.5, 1].map((t, i) => {
        const y = PAD.top + t * (CHART_H - PAD.top - PAD.bottom)
        const val = max - t * range
        return (
          <G key={i}>
            <Line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke={colors.border} strokeWidth={1} />
            <SvgText x={PAD.left - 4} y={y + 4} fontSize={9} fill={colors.subtext} textAnchor="end">
              {val.toFixed(1)}
            </SvgText>
          </G>
        )
      })}
      {/* Line */}
      <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Points + labels */}
      {xs.map((x, i) => (
        <G key={i}>
          <Circle cx={x} cy={ys[i]} r={4} fill={color} />
          <SvgText x={x} y={CHART_H - 6} fontSize={9} fill={colors.subtext} textAnchor="middle">
            {labels[i]}
          </SvgText>
        </G>
      ))}
    </Svg>
  )
}

function BarChartSVG({ data }: { data: SessionPoint[] }) {
  if (data.length === 0) return (
    <View style={styles.chartEmpty}><Text style={styles.chartEmptyText}>Nenhum treino registrado ainda.</Text></View>
  )
  const max = Math.max(...data.map(d => d.count))
  const barW = Math.min(32, (CHART_W - PAD.left - PAD.right) / data.length - 6)
  const total = data.length
  const xs = data.map((_, i) => PAD.left + (i + 0.5) * ((CHART_W - PAD.left - PAD.right) / total))

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {[0, 0.5, 1].map((t, i) => {
        const y = PAD.top + t * (CHART_H - PAD.top - PAD.bottom)
        const val = Math.round(max * (1 - t))
        return (
          <G key={i}>
            <Line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke={colors.border} strokeWidth={1} />
            <SvgText x={PAD.left - 4} y={y + 4} fontSize={9} fill={colors.subtext} textAnchor="end">{val}</SvgText>
          </G>
        )
      })}
      {data.map((d, i) => {
        const barH = max > 0 ? ((d.count / max) * (CHART_H - PAD.top - PAD.bottom)) : 0
        const y = PAD.top + (CHART_H - PAD.top - PAD.bottom) - barH
        return (
          <G key={i}>
            <Path
              d={`M${xs[i] - barW / 2},${y + 4} Q${xs[i] - barW / 2},${y} ${xs[i] - barW / 2 + 4},${y} L${xs[i] + barW / 2 - 4},${y} Q${xs[i] + barW / 2},${y} ${xs[i] + barW / 2},${y + 4} L${xs[i] + barW / 2},${CHART_H - PAD.bottom} L${xs[i] - barW / 2},${CHART_H - PAD.bottom} Z`}
              fill={colors.yellow}
              opacity={0.85}
            />
            <SvgText x={xs[i]} y={CHART_H - 6} fontSize={9} fill={colors.subtext} textAnchor="middle">
              {d.month}
            </SvgText>
          </G>
        )
      })}
    </Svg>
  )
}

function DeltaChip({ value, unit, invert }: { value: number; unit: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0
  const neutral = value === 0
  const color = neutral ? colors.subtext : good ? colors.success : colors.error
  const icon = neutral ? 'remove' : value > 0 ? 'trending-up' : 'trending-down'
  return (
    <View style={[styles.chip, { borderColor: color + '44', backgroundColor: color + '15' }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[styles.chipText, { color }]}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}{unit}
      </Text>
    </View>
  )
}

export default function EvolutionScreen() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [assessments, setAssessments] = useState<AssessmentPoint[]>([])
  const [sessions, setSessions] = useState<SessionPoint[]>([])
  const [studentId, setStudentId] = useState<string | null>(null)
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase
      .from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)

    const [assessRes, sessionRes] = await Promise.all([
      supabase.from('assessments')
        .select('id, weight, height, body_fat_pct, created_at, photos:assessment_photos(id, angle, photo_url)')
        .eq('student_id', student.id)
        .order('created_at', { ascending: true }),
      supabase.from('training_sessions')
        .select('finished_at')
        .eq('student_id', student.id)
        .not('finished_at', 'is', null),
    ])

    const points: AssessmentPoint[] = (assessRes.data || []).map(a => {
      const h = a.height ? a.height / 100 : null
      return {
        id: a.id,
        dateLabel: new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        weight: Number(a.weight),
        imc: h ? parseFloat((a.weight / (h * h)).toFixed(1)) : 0,
        bodyFat: a.body_fat_pct != null ? Number(a.body_fat_pct) : undefined,
        photos: (a.photos as AssessmentPhoto[]) || [],
      }
    })
    setAssessments(points)
    const lastWithPhotos = [...points].reverse().findIndex(a => a.photos.length > 0)
    if (lastWithPhotos !== -1) setSelectedPhotoIdx(points.length - 1 - lastWithPhotos)

    const byMonth: Record<string, number> = {}
    for (const s of sessionRes.data || []) {
      const d = new Date(s.finished_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[key] = (byMonth[key] || 0) + 1
    }
    const sessionPoints: SessionPoint[] = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, count]) => {
        const [year, month] = key.split('-')
        return {
          month: new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', { month: 'short' }),
          count,
        }
      })
    setSessions(sessionPoints)
    setLoading(false)
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  const hasData = assessments.length >= 1
  const hasTwoPoints = assessments.length >= 2
  const hasBodyFat = assessments.some(a => a.bodyFat != null)
  const first = assessments[0]
  const last = assessments[assessments.length - 1]
  const totalSessions = sessions.reduce((s, p) => s + p.count, 0)

  const chartAssessments = assessments.slice(-3)
  const chartLabels = chartAssessments.map(a => a.dateLabel)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Evolução</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {!hasData ? (
        <View style={styles.center}>
          <Ionicons name="trending-up-outline" size={40} color={colors.subtext} />
          <Text style={styles.empty}>Nenhuma avaliação registrada ainda.</Text>
          <Text style={styles.emptySub}>Envie sua primeira avaliação para começar a acompanhar seu progresso.</Text>
        </View>
      ) : (
        <>
          {/* Summary cards */}
          {hasTwoPoints && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Peso atual</Text>
                <Text style={styles.summaryValue}>{last.weight} kg</Text>
                <DeltaChip value={last.weight - first.weight} unit=" kg" invert />
              </View>
              {last.imc > 0 && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>IMC atual</Text>
                  <Text style={styles.summaryValue}>{last.imc}</Text>
                  <DeltaChip value={last.imc - first.imc} unit="" invert />
                </View>
              )}
              {hasBodyFat && last.bodyFat != null && first.bodyFat != null && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>% Gordura</Text>
                  <Text style={styles.summaryValue}>{last.bodyFat}%</Text>
                  <DeltaChip value={last.bodyFat - first.bodyFat} unit="%" invert />
                </View>
              )}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Treinos</Text>
                <Text style={styles.summaryValue}>{totalSessions}</Text>
                <Text style={styles.summarySubLabel}>total</Text>
              </View>
            </View>
          )}

          {/* Peso */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Peso (kg)</Text>
            <Text style={styles.chartSub}>Últimas {chartAssessments.length} avaliação{chartAssessments.length !== 1 ? 'ões' : ''}</Text>
            <LineChartSVG
              data={chartAssessments.map(a => a.weight)}
              color={colors.yellow}
              labels={chartLabels}
            />
          </View>

          {/* IMC */}
          {chartAssessments.some(a => a.imc > 0) && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>IMC</Text>
              <Text style={styles.chartSub}>Índice de Massa Corporal</Text>
              <LineChartSVG
                data={chartAssessments.filter(a => a.imc > 0).map(a => a.imc)}
                color="#60A5FA"
                labels={chartAssessments.filter(a => a.imc > 0).map(a => a.dateLabel)}
              />
            </View>
          )}

          {/* % Gordura */}
          {chartAssessments.some(a => a.bodyFat != null) && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>% Gordura Corporal</Text>
              <Text style={styles.chartSub}>Avaliações com medição</Text>
              <LineChartSVG
                data={chartAssessments.filter(a => a.bodyFat != null).map(a => a.bodyFat!)}
                color="#F87171"
                labels={chartAssessments.filter(a => a.bodyFat != null).map(a => a.dateLabel)}
              />
            </View>
          )}

          {/* Treinos por mês */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Treinos por Mês</Text>
            <Text style={styles.chartSub}>Últimos 6 meses</Text>
            <BarChartSVG data={sessions} />
          </View>

          {/* Fotos de Progresso */}
          {assessments.some(a => a.photos.length > 0) && (() => {
            const withPhotos = assessments.filter(a => a.photos.length > 0)
            const selected = withPhotos[selectedPhotoIdx] ?? withPhotos[withPhotos.length - 1]
            return (
              <View style={styles.photosCard}>
                <Text style={styles.chartTitle}>Fotos de Progresso</Text>

                {/* Seletor de data */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datePicker}>
                  {withPhotos.map((a, i) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.dateChip, selectedPhotoIdx === i && styles.dateChipActive]}
                      onPress={() => setSelectedPhotoIdx(i)}
                    >
                      <Text style={[styles.dateChipText, selectedPhotoIdx === i && styles.dateChipTextActive]}>
                        {a.dateLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Grid de fotos */}
                <View style={styles.photoGrid}>
                  {ANGLE_ORDER.map(angle => {
                    const photo = selected.photos.find(p => p.angle === angle)
                    return (
                      <View key={angle} style={styles.photoSlot}>
                        {photo
                          ? <Image source={{ uri: photo.photo_url }} style={styles.photoImg} resizeMode="cover" />
                          : <View style={styles.photoEmpty}>
                              <Ionicons name="image-outline" size={22} color={colors.border} />
                            </View>
                        }
                        <Text style={styles.photoAngle}>{ANGLE_LABELS[angle]}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })()}
        </>
      )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  content: { paddingBottom: 32, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, paddingTop: 80 },
  empty: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: colors.subtext, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  summaryCard: {
    flex: 1, minWidth: '44%', backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 14, gap: 4,
  },
  summaryLabel: { fontSize: 11, color: colors.subtext, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  summarySubLabel: { fontSize: 11, color: colors.subtext },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  chartCard: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, gap: 4,
  },
  chartTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  chartSub: { fontSize: 12, color: colors.subtext, marginBottom: 12 },
  chartEmpty: { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { color: colors.subtext, fontSize: 13, textAlign: 'center' },
  photosCard: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, gap: 14,
  },
  datePicker: { marginBottom: 4 },
  dateChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.dark, marginRight: 8,
  },
  dateChipActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dateChipText: { fontSize: 12, fontWeight: '600', color: colors.subtext },
  dateChipTextActive: { color: '#0A0A0A' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoSlot: { width: PHOTO_W, gap: 6 },
  photoImg: { width: PHOTO_W, height: PHOTO_W * 1.35, borderRadius: 10 },
  photoEmpty: {
    width: PHOTO_W, height: PHOTO_W * 1.35, borderRadius: 10,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  photoAngle: { fontSize: 11, color: colors.subtext, textAlign: 'center' },
})
