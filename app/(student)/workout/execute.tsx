import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Vibration, ScrollView, AppState, Modal,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Audio } from 'expo-av'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useWorkoutStore } from '@/store/workout'
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
  const {
    totalPausedMs, pausedAt, isPaused,
    restEndAt, setRestEndAt, pause, resume, clearSession,
  } = useWorkoutStore()

  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [sets, setSets] = useState<SetRecord[]>([])
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState(0)

  const [showRestDone, setShowRestDone] = useState(false)
  const tickRef = useRef<any>(null)
  const restEndAtRef = useRef<number | null>(restEndAt)
  const isPausedRef = useRef(isPaused)
  const restFiredRef = useRef(false)
  const soundRef = useRef<Audio.Sound | null>(null)

  useEffect(() => { restEndAtRef.current = restEndAt }, [restEndAt])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { if (restEndAt !== null) restFiredRef.current = false }, [restEndAt])

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {})
    Audio.Sound.createAsync(require('../../../assets/sounds/rest-done.wav'))
      .then(({ sound }) => { soundRef.current = sound })
      .catch(() => {})
    return () => { soundRef.current?.unloadAsync() }
  }, [])

  // Tick de display — para quando pausado
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (isPausedRef.current) return
      forceUpdate(n => n + 1)

      if (restEndAtRef.current && Date.now() >= restEndAtRef.current && !restFiredRef.current) {
        restFiredRef.current = true
        setRestEndAt(null)
        setShowRestDone(true)
        soundRef.current?.replayAsync().catch(() => {})
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Vibration.vibrate([0, 300, 100, 300, 100, 500])
      }
    }, 500)
    return () => clearInterval(tickRef.current)
  }, [])

  // Retorno ao foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        forceUpdate(n => n + 1)
        if (!isPausedRef.current && restEndAtRef.current && Date.now() >= restEndAtRef.current && !restFiredRef.current) {
          restFiredRef.current = true
          setRestEndAt(null)
          setShowRestDone(true)
          soundRef.current?.replayAsync().catch(() => {})
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          Vibration.vibrate([0, 300, 100, 300, 100, 500])
        }
      }
    })
    return () => sub.remove()
  }, [])

  // Inicialização
  useEffect(() => {
    const init = async () => {
      clearSession() // garante estado limpo a cada novo treino

      const { data: day } = await supabase
        .from('workout_days')
        .select(`exercises:workout_exercises(*, exercise:exercises(*))`)
        .eq('id', dayId)
        .single()

      const sorted: WorkoutExercise[] = day?.exercises.sort((a: any, b: any) => a.sort_order - b.sort_order) || []
      setExercises(sorted)

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
    return () => clearInterval(tickRef.current)
  }, [dayId])

  // ── Valores calculados ─────────────────────────────────────────
  // Base = session.started_at do banco (imutável, nunca null após carregar)
  const baseTime = session ? new Date(session.started_at).getTime() : null
  const now = Date.now()

  const elapsedMs = baseTime
    ? (isPaused && pausedAt ? pausedAt : now) - baseTime - totalPausedMs
    : 0
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))

  const restRemaining = restEndAt ? Math.max(0, Math.floor((restEndAt - now) / 1000)) : 0
  const isResting = !!(restEndAt && now < restEndAt)

  // Tempo efetivo para salvar no banco (exclui pausas)
  const effectiveDurationSeconds = () => {
    if (!baseTime) return 0
    const n = Date.now()
    const currentPauseMs = isPaused && pausedAt ? n - pausedAt : 0
    return Math.max(0, Math.floor((n - baseTime - totalPausedMs - currentPauseMs) / 1000))
  }

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── Ações ──────────────────────────────────────────────────────

  const startRestTimer = useCallback((seconds: number) => {
    restFiredRef.current = false
    setRestEndAt(Date.now() + seconds * 1000)
  }, [])

  const handlePauseResume = () => {
    if (isPaused) {
      resume()
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      pause()
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
  }

  const completeSet = (exerciseId: string, setNumber: number) => {
    if (isPaused) return
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber
        ? { ...s, completed: true }
        : s
    ))
    const ex = exercises.find(e => e.exercise_id === exerciseId)
    startRestTimer(ex?.rest_seconds || 60)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  const uncompleteSet = (exerciseId: string, setNumber: number) => {
    if (isPaused) return
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber
        ? { ...s, completed: false }
        : s
    ))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const updateSet = (exerciseId: string, setNumber: number, field: 'weight' | 'repsDone', value: string) => {
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber
        ? { ...s, [field]: value }
        : s
    ))
  }

  const finishWorkout = async () => {
    Alert.alert(
      'Finalizar treino?',
      'Você será direcionado para o feedback.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar', onPress: async () => {
            if (!session) return
            const duration = effectiveDurationSeconds()
            clearSession()

            await supabase.from('training_sessions').update({
              finished_at: new Date().toISOString(),
              duration_seconds: duration,
            }).eq('id', session.id)

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

  // ── Render ─────────────────────────────────────────────────────

  if (loading) return <View style={styles.center}><Text style={{ color: colors.yellow }}>Preparando treino...</Text></View>

  const currentEx = exercises[currentExIdx]
  if (!currentEx) return null

  const exSets = sets.filter(s => s.exerciseId === currentEx.exercise_id)

  return (
    <View style={styles.container}>

      {/* Popup: descanso finalizado */}
      <Modal visible={showRestDone} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.restDoneOverlay}>
          <View style={styles.restDoneCard}>
            <View style={styles.restDoneIconWrap}>
              <Ionicons name="flash" size={36} color="#0A0A0A" />
            </View>
            <Text style={styles.restDoneTitle}>Descansou!</Text>
            <Text style={styles.restDoneSub}>Hora da próxima série 💪</Text>
            <TouchableOpacity
              style={styles.restDoneBtn}
              onPress={() => setShowRestDone(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.restDoneBtnText}>CONTINUAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Overlay de pausa */}
      {isPaused && (
        <TouchableOpacity style={styles.pauseOverlay} onPress={handlePauseResume} activeOpacity={1}>
          <View style={styles.pauseCard}>
            <View style={styles.pauseIconWrap}>
              <Ionicons name="pause" size={36} color="#0A0A0A" />
            </View>
            <Text style={styles.pauseTitle}>Treino pausado</Text>
            <Text style={styles.pauseTime}>{formatElapsed(elapsedSeconds)}</Text>
            <TouchableOpacity style={styles.resumeBtn} onPress={handlePauseResume}>
              <Ionicons name="play" size={20} color="#0A0A0A" />
              <Text style={styles.resumeText}>Retomar treino</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishPausedBtn} onPress={finishWorkout}>
              <Text style={styles.finishPausedText}>Finalizar mesmo assim</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.progress}>
          <View style={styles.progressMeta}>
            <Text style={styles.progressText}>{currentExIdx + 1} / {exercises.length}</Text>
            <View style={styles.elapsed}>
              <Ionicons name="time-outline" size={13} color={colors.yellow} />
              <Text style={styles.elapsedText}>{formatElapsed(elapsedSeconds)}</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((currentExIdx + 1) / exercises.length) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handlePauseResume} style={styles.pauseBtn}>
            <Ionicons name={isPaused ? 'play' : 'pause'} size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={finishWorkout} style={styles.finishBtn}>
            <Text style={styles.finishText}>Finalizar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner de descanso */}
      {isResting && !isPaused && (
        <View style={styles.timerBanner}>
          <Ionicons name="timer" size={16} color={colors.yellow} />
          <Text style={styles.timerText}>Descanso: {restRemaining}s</Text>
          <TouchableOpacity onPress={() => { restFiredRef.current = true; setRestEndAt(null) }}>
            <Text style={styles.timerSkip}>Pular</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                editable={!isPaused}
              />
              <TextInput
                style={[styles.setInput, s.completed && styles.setInputDone]}
                value={s.repsDone}
                onChangeText={v => updateSet(s.exerciseId, s.setNumber, 'repsDone', v)}
                placeholder={currentEx.reps}
                placeholderTextColor={colors.subtext}
                keyboardType="number-pad"
                editable={!isPaused}
              />
              <TouchableOpacity
                style={[styles.checkBtn, s.completed && styles.checkBtnDone]}
                onPress={() => s.completed
                  ? uncompleteSet(s.exerciseId, s.setNumber)
                  : completeSet(s.exerciseId, s.setNumber)
                }
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
            style={[styles.nextBtn, isPaused && styles.nextBtnDisabled]}
            onPress={() => !isPaused && setCurrentExIdx(i => Math.min(exercises.length - 1, i + 1))}
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

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.92)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  pauseCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  pauseIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pauseTitle: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  pauseTime: { fontSize: 42, fontWeight: '900', color: colors.yellow, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.yellow,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 8,
    width: '100%',
    justifyContent: 'center',
  },
  resumeText: { fontSize: 16, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },
  finishPausedBtn: { paddingVertical: 8 },
  finishPausedText: { fontSize: 13, color: colors.subtext, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    gap: 16,
  },
  progress: { flex: 1, gap: 6 },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
  elapsed: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  elapsedText: { fontSize: 12, color: colors.yellow, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressBar: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: colors.yellow, borderRadius: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pauseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  nextBtnDisabled: { opacity: 0.5 },
  nextText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },

  restDoneOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  restDoneCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  restDoneIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  restDoneTitle: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  restDoneSub: { fontSize: 15, color: colors.subtext, textAlign: 'center' },
  restDoneBtn: {
    marginTop: 8,
    width: '100%',
    backgroundColor: colors.yellow,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  restDoneBtnText: { fontSize: 15, fontWeight: '900', color: '#0A0A0A', letterSpacing: 2 },
})
