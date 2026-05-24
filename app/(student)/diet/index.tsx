import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { Diet, DietDay, Meal, MealFood, DietLog, FoodCheck } from '@/types'

interface DietWithDetails extends Diet {
  days: (DietDay & { meals: (Meal & { foods: MealFood[] })[] })[]
}

export default function DietScreen() {
  const { user } = useAuthStore()
  const [diet, setDiet] = useState<DietWithDetails | null>(null)
  const [currentDay, setCurrentDay] = useState<DietDay | null>(null)
  const [dietLog, setDietLog] = useState<DietLog | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [mealNotes, setMealNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const todayWeekday = new Date().getDay()

  useEffect(() => {
    fetchDiet()
  }, [])

  const fetchDiet = async () => {
    const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }

    const { data } = await supabase
      .from('diets')
      .select(`
        *,
        days:diet_days(
          *,
          meals:meals(
            *,
            foods:meal_foods(* , order:sort_order)
          )
        )
      `)
      .eq('student_id', student.id)
      .eq('active', true)
      .lte('valid_from', today)
      .gte('valid_to', today)
      .maybeSingle()

    if (data) {
      setDiet(data)
      // Seleciona o dia mais relevante para hoje
      const todayDay = data.days?.find((d: DietDay) => d.weekday?.includes(todayWeekday))
      const dayToShow = todayDay || data.days?.[0]
      setCurrentDay(dayToShow)

      if (dayToShow) await fetchLog(student.id, dayToShow.id)
    }
    setLoading(false)
  }

  const fetchLog = async (studentId: string, dayId: string) => {
    let { data: log } = await supabase
      .from('diet_logs')
      .select('*')
      .eq('student_id', studentId)
      .eq('diet_day_id', dayId)
      .eq('date', today)
      .maybeSingle()

    if (!log) {
      const { data: newLog } = await supabase
        .from('diet_logs')
        .insert({ student_id: studentId, diet_day_id: dayId, date: today })
        .select()
        .single()
      log = newLog
    }

    if (log) {
      setDietLog(log)
      setMealNotes(log.meal_notes || {})

      const { data: foodChecks } = await supabase
        .from('food_checks')
        .select('*')
        .eq('diet_log_id', log.id)

      const checkMap: Record<string, boolean> = {}
      foodChecks?.forEach((fc: FoodCheck) => { checkMap[fc.meal_food_id] = fc.checked })
      setChecks(checkMap)
    }
  }

  const toggleCheck = async (foodId: string) => {
    if (!dietLog) return
    const newVal = !checks[foodId]
    setChecks(prev => ({ ...prev, [foodId]: newVal }))

    const existing = await supabase
      .from('food_checks')
      .select('id')
      .eq('diet_log_id', dietLog.id)
      .eq('meal_food_id', foodId)
      .maybeSingle()

    if (existing.data) {
      await supabase.from('food_checks').update({
        checked: newVal,
        checked_at: newVal ? new Date().toISOString() : null,
      }).eq('id', existing.data.id)
    } else {
      await supabase.from('food_checks').insert({
        diet_log_id: dietLog.id,
        meal_food_id: foodId,
        checked: newVal,
        checked_at: newVal ? new Date().toISOString() : null,
      })
    }
  }

  const saveMealNote = async (mealId: string, note: string) => {
    if (!dietLog) return
    const updated = { ...mealNotes, [mealId]: note }
    setMealNotes(updated)
    await supabase.from('diet_logs').update({ meal_notes: updated }).eq('id', dietLog.id)
  }

  // Cálculo de macros do dia
  const calcTotals = () => {
    if (!currentDay) return { cal: 0, prot: 0, carbs: 0, fat: 0 }
    let cal = 0, prot = 0, carbs = 0, fat = 0
    currentDay.meals?.forEach(meal => {
      meal.foods?.forEach(food => {
        if (checks[food.id]) {
          cal += food.calories
          prot += food.protein
          carbs += food.carbs
          fat += food.fat
        }
      })
    })
    return { cal: Math.round(cal), prot: Math.round(prot), carbs: Math.round(carbs), fat: Math.round(fat) }
  }

  const totalGoal = currentDay?.calorie_goal || 0
  const totals = calcTotals()
  const calPct = totalGoal > 0 ? Math.min(totals.cal / totalGoal, 1) : 0

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>
  if (!diet || !currentDay) {
    return (
      <View style={styles.center}>
        <Ionicons name="nutrition-outline" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>Sem dieta ativa</Text>
        <Text style={styles.emptyText}>Aguarde seu coach criar sua dieta.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{diet.name}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
          {diet.days?.map(day => (
            <TouchableOpacity
              key={day.id}
              style={[styles.dayTab, currentDay.id === day.id && styles.dayTabActive]}
              onPress={() => {
                setCurrentDay(day)
                if (dietLog?.diet_day_id !== day.id) fetchLog(dietLog?.student_id || '', day.id)
              }}
            >
              <Text style={[styles.dayTabText, currentDay.id === day.id && styles.dayTabTextActive]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Barra de calorias */}
      <View style={styles.caloriesBar}>
        <View style={styles.caloriesInfo}>
          <Text style={styles.caloriesValue}>{totals.cal} kcal</Text>
          {totalGoal > 0 && <Text style={styles.caloriesGoal}>/ {totalGoal} kcal</Text>}
        </View>
        <View style={styles.caloriesProgress}>
          <View style={[styles.caloriesProgressFill, { width: `${calPct * 100}%` }]} />
        </View>
        <View style={styles.macrosRow}>
          <MacroChip label="Prot." value={totals.prot} unit="g" color="#4FC3F7" />
          <MacroChip label="Carb." value={totals.carbs} unit="g" color="#FFB74D" />
          <MacroChip label="Gord." value={totals.fat} unit="g" color="#F06292" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {currentDay.meals?.sort((a, b) => a.sort_order - b.sort_order).map(meal => (
          <View key={meal.id} style={styles.mealCard}>
            <View style={styles.mealHeader}>
              <View>
                <Text style={styles.mealName}>{meal.name}</Text>
                {meal.suggested_time && (
                  <Text style={styles.mealTime}>{meal.suggested_time.slice(0, 5)}</Text>
                )}
              </View>
              <Text style={styles.mealCals}>
                {Math.round(meal.foods?.reduce((s, f) => s + f.calories, 0) || 0)} kcal
              </Text>
            </View>

            {meal.foods?.sort((a, b) => a.sort_order - b.sort_order).map(food => (
              <TouchableOpacity
                key={food.id}
                style={[styles.foodRow, checks[food.id] && styles.foodRowChecked]}
                onPress={() => toggleCheck(food.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checks[food.id] && styles.checkboxChecked]}>
                  {checks[food.id] && <Ionicons name="checkmark" size={14} color="#0A0A0A" />}
                </View>
                <View style={styles.foodInfo}>
                  <Text style={[styles.foodName, checks[food.id] && styles.foodNameChecked]}>
                    {food.name}
                  </Text>
                  <Text style={styles.foodQuantity}>
                    {food.quantity}{food.unit} · P:{food.protein}g C:{food.carbs}g G:{food.fat}g
                  </Text>
                </View>
                <Text style={styles.foodCals}>{food.calories} kcal</Text>
              </TouchableOpacity>
            ))}

            {/* Nota da refeição */}
            <TextInput
              style={styles.mealNote}
              value={mealNotes[meal.id] || ''}
              onChangeText={v => setMealNotes(prev => ({ ...prev, [meal.id]: v }))}
              onEndEditing={() => saveMealNote(meal.id, mealNotes[meal.id] || '')}
              placeholder="Anotação (substituições, etc.)"
              placeholderTextColor={colors.subtext}
              multiline
            />
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function MacroChip({ label, value, unit, color }: any) {
  return (
    <View style={styles.macroChip}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value}{unit}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.dark },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.subtext },
  header: { paddingTop: 60, paddingBottom: 8, gap: 16 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, paddingHorizontal: 24 },
  dayTabs: { paddingHorizontal: 24 },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    backgroundColor: colors.card,
  },
  dayTabActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dayTabText: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  dayTabTextActive: { color: '#0A0A0A' },
  caloriesBar: {
    marginHorizontal: 24,
    marginVertical: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  caloriesInfo: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  caloriesValue: { fontSize: 24, fontWeight: '900', color: colors.text },
  caloriesGoal: { fontSize: 14, color: colors.subtext },
  caloriesProgress: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  caloriesProgressFill: { height: 6, backgroundColor: colors.yellow, borderRadius: 3 },
  macrosRow: { flexDirection: 'row', gap: 16 },
  macroChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: 12, color: colors.subtext },
  macroValue: { fontSize: 12, fontWeight: '700', color: colors.text },
  list: { padding: 24, paddingTop: 0, gap: 12, paddingBottom: 32 },
  mealCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mealName: { fontSize: 15, fontWeight: '700', color: colors.text },
  mealTime: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  mealCals: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  foodRowChecked: { backgroundColor: `${colors.yellow}08` },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  foodInfo: { flex: 1 },
  foodName: { fontSize: 14, color: colors.text, fontWeight: '500' },
  foodNameChecked: { textDecorationLine: 'line-through', color: colors.subtext },
  foodQuantity: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  foodCals: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
  mealNote: {
    padding: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.subtext,
    fontStyle: 'italic',
  },
})
