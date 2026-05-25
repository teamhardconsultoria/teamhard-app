import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path, Line, Circle, Text as SvgText, G } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

const SCREEN_W = Dimensions.get('window').width
const CHART_W = SCREEN_W - 48
const CHART_H = 160
const PAD = { top: 16, bottom: 28, left: 36, right: 12 }

interface AssessmentPoint {
  dateLabel: string
  weight: number
  imc: number
  bodyFat?: number
}

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

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase
      .from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)

    const [assessRes, sessionRes] = await Promise.all([
      supabase.from('assessments')
        .select('weight, height, body_fat_pct, created_at')
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
        dateLabel: new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        weight: Number(a.weight),
        imc: h ? parseFloat((a.weight / (h * h)).toFixed(1)) : 0,
        bodyFat: a.body_fat_pct != null ? Number(a.body_fat_pct) : undefined,
      }
    })
    setAssessments(points)

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
  const labels = assessments.map(a => a.dateLabel)
  const totalSessions = sessions.reduce((s, p) => s + p.count, 0)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Evolução</Text>
      </View>

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
            <Text style={styles.chartSub}>{assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''}</Text>
            <LineChartSVG
              data={assessments.map(a => a.weight)}
              color={colors.yellow}
              labels={labels}
            />
          </View>

          {/* IMC */}
          {assessments.some(a => a.imc > 0) && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>IMC</Text>
              <Text style={styles.chartSub}>Índice de Massa Corporal</Text>
              <LineChartSVG
                data={assessments.filter(a => a.imc > 0).map(a => a.imc)}
                color="#60A5FA"
                labels={assessments.filter(a => a.imc > 0).map(a => a.dateLabel)}
              />
            </View>
          )}

          {/* % Gordura */}
          {hasBodyFat && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>% Gordura Corporal</Text>
              <Text style={styles.chartSub}>Avaliações com medição</Text>
              <LineChartSVG
                data={assessments.filter(a => a.bodyFat != null).map(a => a.bodyFat!)}
                color="#F87171"
                labels={assessments.filter(a => a.bodyFat != null).map(a => a.dateLabel)}
              />
            </View>
          )}

          {/* Treinos por mês */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Treinos por Mês</Text>
            <Text style={styles.chartSub}>Últimos 6 meses</Text>
            <BarChartSVG data={sessions} />
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  content: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, paddingTop: 80 },
  empty: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: colors.subtext, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  header: {
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
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
})
