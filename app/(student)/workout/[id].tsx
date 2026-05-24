import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'
import type { WorkoutDay, WorkoutExercise } from '@/types'

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [day, setDay] = useState<WorkoutDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('workout_days')
        .select(`
          *,
          exercises:workout_exercises(
            *,
            exercise:exercises(*)
          )
        `)
        .eq('id', id)
        .single()
      setDay(data)
      setLoading(false)
    }
    fetch()
  }, [id])

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>
  if (!day) return null

  const sortedExercises = day.exercises?.sort((a, b) => a.sort_order - b.sort_order) || []

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Treino {day.name}</Text>
          <Text style={styles.subtitle}>{sortedExercises.length} exercícios</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {sortedExercises.map((we, index) => (
          <ExerciseCard key={we.id} item={we} index={index} />
        ))}
      </ScrollView>

      {/* Botão de iniciar */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => router.push({ pathname: '/(student)/workout/execute', params: { dayId: id } })}
        >
          <Ionicons name="play" size={18} color="#0A0A0A" />
          <Text style={styles.startText}>INICIAR TREINO</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ExerciseCard({ item, index }: { item: WorkoutExercise; index: number }) {
  const openVideo = () => {
    if (item.exercise?.youtube_url) Linking.openURL(item.exercise.youtube_url)
  }

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseNumber}>
          <Text style={styles.exerciseNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{item.exercise?.name}</Text>
          {item.exercise?.muscle_groups?.length > 0 && (
            <Text style={styles.exerciseMuscles}>
              {item.exercise.muscle_groups.join(', ')}
            </Text>
          )}
        </View>
        {item.exercise?.youtube_url && (
          <TouchableOpacity style={styles.videoBtn} onPress={openVideo}>
            <Ionicons name="play-circle" size={28} color={colors.yellow} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.exerciseMeta}>
        <MetaChip icon="repeat" label={`${item.sets} séries`} />
        <MetaChip icon="fitness" label={item.reps} />
        <MetaChip icon="timer" label={`${item.rest_seconds}s descanso`} />
      </View>

      {item.coach_notes && (
        <View style={styles.notes}>
          <Ionicons name="information-circle" size={14} color={colors.yellow} />
          <Text style={styles.notesText}>{item.coach_notes}</Text>
        </View>
      )}
    </View>
  )
}

function MetaChip({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={colors.yellow} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    gap: 14,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 13, color: colors.subtext, marginTop: 2 },
  list: { padding: 24, paddingTop: 8, gap: 12, paddingBottom: 100 },
  exerciseCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: { fontSize: 14, fontWeight: '700', color: colors.subtext },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 15, fontWeight: '700', color: colors.text },
  exerciseMuscles: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  videoBtn: { padding: 4 },
  exerciseMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  notes: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: `${colors.yellow}11`,
    borderRadius: 8,
    padding: 10,
  },
  notesText: { flex: 1, fontSize: 13, color: colors.subtext, lineHeight: 18 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: colors.dark,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
})
