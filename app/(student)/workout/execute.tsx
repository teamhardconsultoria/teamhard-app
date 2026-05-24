import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Vibration, ScrollView,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { WorkoutExercise, TrainingSession } from '@/types'

interface SetRecord {
  exerciseId: string
  setNumber: number
  weight: string
  repsDone: string
  completed: boolean
}

export default function ExecuteWorkoutScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>()
  const { user } = useAuthStore()

  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [sets, setSets] = useState<SetRecord[]>([])
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [restTimer, setRestTimer] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [loading, setLoading] = useState(true)

  const timerRef = useRef<any>(null)

  // ── Inicialização ────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: day } = await supabase
        .from('workout_days')
        .select(`exercises:workout_exercises(*, exercise:exercises(*))`)
        .eq('id', dayId)
        .single()

      const sorted: WorkoutExercise[] = day?.exercises.sort((a: any, b: any) => a.sort_order - b.sort_order) || []
      setExercises(sorted)

      // Monta registros de séries vazios
      const initialSets: SetRecord[] = sorted.flatMap(ex =>
        Array.from({ length: ex.sets }, (_, i) => ({
          exerciseId: ex.exercise_id,
          setNumber: i + 1,
          weight: '',
          repsDone: '',
          completed: false,
        }))
      )
      setSets(initialSets)

      // Cria sessão no banco
      const { data: studentData } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
      const { data: sess } = await supabase.from('training_sessions').insert({
        student_id: studentData!.id,
        workout_day_id: dayId,
        started_at: new Date().toISOString(),
      }).select().single()

      setSession(sess)
      setLoading(false)
    }
    init()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [dayId])

  // ── Timer de descanso ────────────────────────────────────────

  const startRestTimer = useCallback((seconds: number) => {
    setRestTimer(seconds)
    setTimerActive(true)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setTimerActive(false)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          Vibration.vibrate([0, 400, 200, 400])
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // ── Marcar série como concluída ──────────────────────────────

  const completeSet = (exerciseId: string, setNumber: number) => {
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber
        ? { ...s, completed: true }
        : s
    ))
    const ex = exercises.find(e => e.exercise_id === exerciseId)
    if (ex?.rest_seconds) startRestTimer(ex.rest_seconds)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  const updateSet = (exerciseId: string, setNumber: number, field: 'weight' | 'repsDone', value: string) => {
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber
        ? { ...s, [field]: value }
        : s
    ))
  }

  // ── Finalizar treino ─────────────────────────────────────────

  const finishWorkout = async () => {
    Alert.alert(
      'Finalizar treino?',
      'Você será direcionado para o feedback.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar', onPress: async () => {
            if (!session) return

            const endTime = new Date()
            const startTime = new Date(session.started_at)
            const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)

            // Salva sessão
            await supabase.from('training_sessions').update({
              finished_at: endTime.toISOString(),
              duration_seconds: duration,
            }).eq('id', session.id)

            // Salva séries
            const completedSets = sets.filter(s => s.completed)
            if (completedSets.length > 0) {
              await supabase.from('session_sets').insert(
                completedSets.map(s => ({
                  session_id: session.id,
                  exercise_id: s.exerciseId,
                  set_number: s.setNumber,
                  weight_used: s.weight ? parseFloat(s.weight) : null,
                  reps_done: s.repsDone ? parseInt(s.repsDone) : null,
                }))
              )
            }

            router.replace({
              pathname: '/(student)/workout/feedback',
              params: { sessionId: session.id },
            })
          }
        },
      ]
    )
  }

  if (loading) return <View style={styles.center}><Text style={{ color: colors.yellow }}>Preparando treino...</Text></View>

  const currentEx = exercises[currentExIdx]
  if (!currentEx) return null

  const exSets = sets.filter(s => s.exerciseId === currentEx.exercise_id)
  const completedCount = exSets.filter(s => s.completed).length
  const allCompleted = sets.every(s => s.completed)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {currentExIdx + 1} / {exercises.length}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((currentExIdx + 1) / exercises.length) * 100}%` }]} />
          </View>
        </View>
        <TouchableOpacity onPress={finishWorkout} style={styles.finishBtn}>
          <Text style={styles.finishText}>Finalizar</Text>
        </TouchableOpacity>
      </View>

      {/* Timer de descanso */}
      {timerActive && (
        <View style={styles.timerBanner}>
          <Ionicons name="timer" size={16} color={colors.yellow} />
          <Text style={styles.timerText}>Descanso: {restTimer}s</Text>
          <TouchableOpacity onPress={() => { clearInterval(timerRef.current); setTimerActive(false) }}>
            <Text style={styles.timerSkip}>Pular</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nome do exercício */}
        <Text style={styles.exName}>{currentEx.exercise?.name}</Text>
        {currentEx.exercise?.muscle_groups?.length > 0 && (
          <Text style={styles.exMuscles}>{currentEx.exercise.muscle_groups.join(', ')}</Text>
        )}
        <Text style={styles.exMeta}>
          {currentEx.sets} séries · {currentEx.reps} · {currentEx.rest_seconds}s descanso
        </Text>

        {currentEx.coach_notes && (
          <View style={styles.notes}>
            <Ionicons name="information-circle" size={14} color={colors.yellow} />
            <Text style={styles.notesText}>{currentEx.coach_notes}</Text>
          </View>
        )}

        {/* Séries */}
        <View style={styles.setsContainer}>
          <View style={styles.setsHeader}>
            <Text style={styles.setsHeaderCell}>Série</Text>
            <Text style={styles.setsHeaderCell}>Carga (kg)</Text>
            <Text style={styles.setsHeaderCell}>Reps</Text>
            <Text style={[styles.setsHeaderCell, { width: 48 }]} />
          </View>
          {exSets.map((s) => (
            <View key={s.setNumber} style={[styles.setRow, s.completed && styles.setRowDone]}>
              <View style={styles.setNumber}>
                <Text style={[styles.setNumberText, s.completed && styles.setNumberTextDone]}>
                  {s.setNumber}
                </Text>
              </View>
              <TextInput
                style={[styles.setInput, s.completed && styles.setInputDone]}
                value={s.weight}
                onChangeText={v => updateSet(s.exerciseId, s.setNumber, 'weight', v)}
                placeholder="—"
                placeholderTextColor={colors.subtext}
                keyboardType="decimal-pad"
                editable={!s.completed}
              />
              <TextInput
                style={[styles.setInput, s.completed && styles.setInputDone]}
                value={s.repsDone}
                onChangeText={v => updateSet(s.exerciseId, s.setNumber, 'repsDone', v)}
                placeholder={currentEx.reps}
                placeholderTextColor={colors.subtext}
                keyboardType="number-pad"
                editable={!s.completed}
              />
              <TouchableOpacity
                style={[styles.checkBtn, s.completed && styles.checkBtnDone]}
                onPress={() => !s.completed && completeSet(s.exerciseId, s.setNumber)}
              >
                <Ionicons
                  name={s.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={s.completed ? '#0A0A0A' : colors.subtext}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Navegação entre exercícios */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navBtn, currentExIdx === 0 && styles.navBtnDisabled]}
          onPress={() => setCurrentExIdx(i => Math.max(0, i - 1))}
          disabled={currentExIdx === 0}
        >
          <Ionicons name="arrow-back" size={20} color={currentExIdx === 0 ? colors.muted : colors.text} />
          <Text style={[styles.navText, currentExIdx === 0 && { color: colors.muted }]}>Anterior</Text>
        </TouchableOpacity>

        {currentExIdx < exercises.length - 1 ? (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => setCurrentExIdx(i => Math.min(exercises.length - 1, i + 1))}
          >
            <Text style={styles.nextText}>Próximo</Text>
            <Ionicons name="arrow-forward" size={20} color="#0A0A0A" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} onPress={finishWorkout}>
            <Text style={styles.nextText}>Finalizar</Text>
            <Ionicons name="flag" size={20} color="#0A0A0A" />
          </TouchableOpacity>
        )}
      </View>
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
    gap: 16,
  },
  progress: { flex: 1, gap: 6 },
  progressText: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
  progressBar: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: colors.yellow, borderRadius: 2 },
  finishBtn: { padding: 8 },
  finishText: { fontSize: 14, color: colors.subtext, fontWeight: '600' },
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.yellow}15`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.yellow}33`,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  timerText: { flex: 1, fontSize: 14, color: colors.yellow, fontWeight: '700' },
  timerSkip: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  content: { padding: 24, gap: 16, paddingBottom: 120 },
  exName: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  exMuscles: { fontSize: 13, color: colors.subtext },
  exMeta: { fontSize: 13, color: colors.subtext },
  notes: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: `${colors.yellow}11`,
    borderRadius: 8,
    padding: 10,
  },
  notesText: { flex: 1, fontSize: 13, color: colors.subtext, lineHeight: 18 },
  setsContainer: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  setsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setsHeaderCell: {
    flex: 1,
    fontSize: 11,
    color: colors.subtext,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  setRowDone: { backgroundColor: `${colors.yellow}08` },
  setNumber: { width: 32, alignItems: 'center' },
  setNumberText: { fontSize: 16, fontWeight: '700', color: colors.subtext },
  setNumberTextDone: { color: colors.yellow },
  setInput: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  setInputDone: { backgroundColor: `${colors.yellow}22`, color: colors.yellow },
  checkBtn: { width: 40, alignItems: 'center' },
  checkBtnDone: {},
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.dark,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
  },
  navBtnDisabled: { opacity: 0.4 },
  navText: { fontSize: 14, fontWeight: '700', color: colors.text },
  nextBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.yellow,
    borderRadius: 12,
    paddingVertical: 14,
  },
  nextText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },
})
