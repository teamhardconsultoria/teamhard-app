import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { Workout, WorkoutDay } from '@/types'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function WorkoutListScreen() {
  const { user } = useAuthStore()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWorkout = async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
      if (!student) { setLoading(false); return }

      const { data } = await supabase
        .from('workouts')
        .select(`
          *,
          days:workout_days(
            *,
            exercises:workout_exercises(
              *,
              exercise:exercises(*)
            )
          )
        `)
        .eq('student_id', student.id)
        .eq('active', true)
        .lte('valid_from', today)
        .gte('valid_to', today)
        .maybeSingle()

      setWorkout(data)
      setLoading(false)
    }
    fetchWorkout()
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.yellow} />
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={styles.center}>
        <Ionicons name="barbell-outline" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>Sem treino ativo</Text>
        <Text style={styles.emptyText}>Aguarde seu coach criar seu treino.</Text>
      </View>
    )
  }

  const todayWeekday = new Date().getDay()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{workout.name}</Text>
        <Text style={styles.validity}>
          Válido até {new Date(workout.valid_to).toLocaleDateString('pt-BR')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {workout.days?.sort((a, b) => a.sort_order - b.sort_order).map(day => {
          const isToday = day.weekday_suggestion?.includes(todayWeekday)
          const exerciseCount = day.exercises?.length || 0

          return (
            <TouchableOpacity
              key={day.id}
              style={[styles.dayCard, isToday && styles.dayCardToday]}
              onPress={() => router.push({ pathname: '/(student)/workout/[id]', params: { id: day.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.dayLeft}>
                <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                  <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>
                    {day.name}
                  </Text>
                </View>
                <View>
                  <Text style={styles.dayName}>Treino {day.name}</Text>
                  <Text style={styles.dayMeta}>
                    {exerciseCount} exercício{exerciseCount !== 1 ? 's' : ''}
                    {day.weekday_suggestion?.length > 0 && (
                      ` · ${day.weekday_suggestion.map(d => WEEKDAYS[d]).join(', ')}`
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.dayRight}>
                {isToday && (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayBadgeText}>HOJE</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.dark },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.subtext },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, gap: 4 },
  title: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  validity: { fontSize: 13, color: colors.subtext },
  list: { padding: 24, paddingTop: 8, gap: 12 },
  dayCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCardToday: { borderColor: colors.yellow + '66' },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeToday: { backgroundColor: colors.yellow },
  dayLetter: { fontSize: 18, fontWeight: '900', color: colors.subtext },
  dayLetterToday: { color: '#0A0A0A' },
  dayName: { fontSize: 15, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  dayRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayBadge: {
    backgroundColor: `${colors.yellow}22`,
    borderWidth: 1,
    borderColor: `${colors.yellow}44`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayBadgeText: { fontSize: 10, fontWeight: '800', color: colors.yellow, letterSpacing: 1 },
})
