import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, G } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { DietDay, Meal, MealFood } from '@/types'

const CHART_SIZE = 180
const STROKE = 22
const R = (CHART_SIZE - STROKE) / 2
const CX = CHART_SIZE / 2
const CIRC = 2 * Math.PI * R

interface DayWithMeals extends DietDay {
  meals: (Meal & { foods: MealFood[] })[]
}

interface Summary {
  dietName: string
  day: DayWithMeals
  checks: Record<string, boolean>
  cal: number; prot: number; carbs: number; fat: number
}

export default function DietSummaryScreen() {
  const { user } = useAuthStore()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const todayWeekday = new Date().getDay()
  const today = new Date().toISOString().split('T')[0]

  useFocusEffect(useCallback(() => {
    load()
  }, []))

  const load = async () => {
    setLoading(true)
    const { data: student } = await supabase
      .from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }

    const { data: diet } = await supabase
      .from('diets')
      .select('name, days:diet_days(*, meals:meals(*, foods:meal_foods(*)))')
      .eq('student_id', student.id)
      .eq('active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!diet) { setLoading(false); return }

    const days = (diet as any).days as DayWithMeals[]
    const day = days.find((d) => d.weekday?.includes(todayWeekday)) || days[0]
    if (!day) { setLoading(false); return }

    const { data: log } = await supabase
      .from('diet_logs')
      .select('id')
      .eq('student_id', student.id)
      .eq('diet_day_id', day.id)
      .eq('date', today)
      .maybeSingle()

    const checks: Record<string, boolean> = {}
    if (log) {
      const { data: fc } = await supabase
        .from('food_checks').select('meal_food_id, checked').eq('diet_log_id', log.id)
      fc?.forEach((r: any) => { checks[r.meal_food_id] = r.checked })
    }

    let cal = 0, prot = 0, carbs = 0, fat = 0
    day.meals?.forEach((m) => m.foods?.forEach((f) => {
      if (checks[f.id]) { cal += f.calories; prot += f.protein; carbs += f.carbs; fat += f.fat }
    }))

    setSummary({
      dietName: (diet as any).name,
      day,
      checks,
      cal: Math.round(cal),
      prot: Math.round(prot),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    })
    setLoading(false)
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={colors.yellow} size="large" /></View>
  )

  if (!summary) return (
    <View style={styles.center}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Ionicons name="nutrition-outline" size={48} color={colors.border} />
      <Text style={styles.emptyText}>Sem dieta ativa para hoje.</Text>
    </View>
  )

  const { day, checks, cal, prot, carbs, fat } = summary
  const calGoal = day.calorie_goal || 0
  const calPct = calGoal > 0 ? Math.min(cal / calGoal, 1) : 0

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Resumo do Dia</Text>
          <Text style={styles.sub}>{summary.dietName} · {day.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Donut chart */}
        <View style={styles.chartSection}>
          <DonutChart prot={prot} carbs={carbs} fat={fat} cal={cal} calGoal={calGoal} />
        </View>

        {/* Macro bars */}
        <View style={styles.card}>
          <MacroRow
            color="#4FC3F7" label="Proteína"
            value={prot} goal={day.protein_goal}
          />
          <View style={styles.divider} />
          <MacroRow
            color="#FFB74D" label="Carboidratos"
            value={carbs} goal={day.carbs_goal}
          />
          <View style={styles.divider} />
          <MacroRow
            color="#F06292" label="Gorduras"
            value={fat} goal={day.fat_goal}
          />
        </View>

        {/* Calorias */}
        <View style={styles.card}>
          <View style={styles.calRow}>
            <Text style={styles.calLabel}>Calorias</Text>
            <Text style={styles.calValue}>
              <Text style={styles.calConsumed}>{cal}</Text>
              {calGoal > 0 && <Text style={styles.calGoalText}> / {calGoal} kcal</Text>}
            </Text>
          </View>
          {calGoal > 0 && (
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${calPct * 100}%` }]} />
            </View>
          )}
        </View>

        {/* Refeições */}
        <Text style={styles.sectionTitle}>Refeições</Text>
        {day.meals?.sort((a, b) => a.sort_order - b.sort_order).map((meal) => {
          const total = meal.foods?.length || 0
          const done = meal.foods?.filter((f) => checks[f.id]).length || 0
          const pct = total > 0 ? done / total : 0
          return (
            <View key={meal.id} style={styles.mealCard}>
              <View style={styles.mealRow}>
                <View style={styles.mealLeft}>
                  <Text style={styles.mealName}>{meal.name}</Text>
                  {meal.suggested_time && (
                    <Text style={styles.mealTime}>{meal.suggested_time.slice(0, 5)}</Text>
                  )}
                </View>
                <View style={[styles.badge, done === total && total > 0 && styles.badgeDone]}>
                  <Text style={[styles.badgeText, done === total && total > 0 && styles.badgeTextDone]}>
                    {done}/{total}
                  </Text>
                </View>
              </View>
              {total > 0 && (
                <View style={styles.mealProgressBg}>
                  <View style={[styles.mealProgressFill, { width: `${pct * 100}%` }]} />
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

function DonutChart({ prot, carbs, fat, cal, calGoal }: {
  prot: number; carbs: number; fat: number; cal: number; calGoal: number
}) {
  const total = prot + carbs + fat

  if (total === 0) {
    return (
      <View style={styles.chartWrap}>
        <Svg width={CHART_SIZE} height={CHART_SIZE}>
          <Circle cx={CX} cy={CX} r={R} fill="none" stroke={colors.border} strokeWidth={STROKE} />
        </Svg>
        <View style={styles.chartCenter}>
          <Text style={styles.chartCal}>{cal}</Text>
          <Text style={styles.chartKcal}>kcal</Text>
        </View>
      </View>
    )
  }

  const protFrac = prot / total
  const carbsFrac = carbs / total
  const fatFrac = fat / total

  const protLen = protFrac * CIRC
  const carbsLen = carbsFrac * CIRC
  const fatLen = fatFrac * CIRC

  const protOff = CIRC
  const carbsOff = CIRC * (1 - protFrac)
  const fatOff = CIRC * (1 - protFrac - carbsFrac)

  return (
    <View style={styles.chartWrap}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        <G rotation={-90} origin={`${CX}, ${CX}`}>
          <Circle cx={CX} cy={CX} r={R} fill="none" stroke={colors.border} strokeWidth={STROKE} />
          <Circle cx={CX} cy={CX} r={R} fill="none" stroke="#4FC3F7" strokeWidth={STROKE}
            strokeDasharray={`${protLen} ${CIRC - protLen}`}
            strokeDashoffset={protOff} />
          <Circle cx={CX} cy={CX} r={R} fill="none" stroke="#FFB74D" strokeWidth={STROKE}
            strokeDasharray={`${carbsLen} ${CIRC - carbsLen}`}
            strokeDashoffset={carbsOff} />
          <Circle cx={CX} cy={CX} r={R} fill="none" stroke="#F06292" strokeWidth={STROKE}
            strokeDasharray={`${fatLen} ${CIRC - fatLen}`}
            strokeDashoffset={fatOff} />
        </G>
      </Svg>
      <View style={styles.chartCenter}>
        <Text style={styles.chartCal}>{cal}</Text>
        <Text style={styles.chartKcal}>kcal</Text>
        {calGoal > 0 && <Text style={styles.chartGoal}>/ {calGoal}</Text>}
      </View>
    </View>
  )
}

function MacroRow({ color, label, value, goal }: {
  color: string; label: string; value: number; goal?: number
}) {
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLeft}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <View style={styles.macroRight}>
        <Text style={styles.macroValue}>{value}g</Text>
        {goal ? <Text style={styles.macroGoal}> / {goal}g</Text> : null}
      </View>
      {goal ? (
        <View style={styles.macroBg}>
          <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 14, color: colors.subtext },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  sub: { fontSize: 13, color: colors.subtext, marginTop: 2 },
  scroll: { padding: 20, paddingTop: 4, gap: 12, paddingBottom: 40 },

  chartSection: { alignItems: 'center', paddingVertical: 8 },
  chartWrap: { width: CHART_SIZE, height: CHART_SIZE, position: 'relative' },
  chartCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  chartCal: { fontSize: 28, fontWeight: '900', color: colors.text, lineHeight: 32 },
  chartKcal: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
  chartGoal: { fontSize: 11, color: colors.muted, marginTop: 2 },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16, gap: 12,
  },
  divider: { height: 1, backgroundColor: colors.border },

  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  macroLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 130 },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroLabel: { fontSize: 14, color: colors.text, fontWeight: '500' },
  macroRight: { flexDirection: 'row', alignItems: 'baseline', flex: 1 },
  macroValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  macroGoal: { fontSize: 12, color: colors.subtext },
  macroBg: { width: '100%', height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4 },
  macroFill: { height: 4, borderRadius: 2 },

  calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calLabel: { fontSize: 14, color: colors.subtext, fontWeight: '600' },
  calValue: { flexDirection: 'row', alignItems: 'baseline' },
  calConsumed: { fontSize: 18, fontWeight: '900', color: colors.text },
  calGoalText: { fontSize: 13, color: colors.subtext },
  progressBg: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: colors.yellow, borderRadius: 3 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  mealCard: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, gap: 10,
  },
  mealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealLeft: { gap: 2 },
  mealName: { fontSize: 15, fontWeight: '700', color: colors.text },
  mealTime: { fontSize: 12, color: colors.subtext },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, backgroundColor: colors.border,
  },
  badgeDone: { backgroundColor: `${colors.yellow}20` },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.subtext },
  badgeTextDone: { color: colors.yellow },
  mealProgressBg: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
  mealProgressFill: { height: 4, backgroundColor: colors.yellow, borderRadius: 2 },
})
