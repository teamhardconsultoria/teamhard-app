import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Timer, Pause, Play, ChevronLeft, ChevronRight, Flag, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { subscribeWebPush, scheduleRestNotification, invalidateRestNonce } from '../../lib/webpush'

interface SetRecord {
  exerciseId: string
  setNumber: number
  weight: string
  repsDone: string
  completed: boolean
}

interface Exercise {
  id: string
  exercise_id: string
  sets: number
  reps: string
  rest_seconds: number
  coach_notes?: string
  sort_order: number
  exercise: { name: string; muscle_groups?: string[] }
}

interface Session { id: string; started_at: string }

const spin: React.CSSProperties = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function postToSW(msg: object) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(msg)
  }
}

async function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
  } catch {}
}

export default function StudentWorkoutExecute() {
  const { dayId } = useParams<{ dayId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [sets, setSets] = useState<SetRecord[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [showRestDone, setShowRestDone] = useState(false)
  const [showPauseOverlay, setShowPauseOverlay] = useState(false)
  const [, forceUpdate] = useState(0)

  const restEndAtRef = useRef<number | null>(null)
  const restFiredRef = useRef(false)
  const restExerciseNameRef = useRef('')
  const studentIdRef = useRef<string | null>(null)
  const restNonceRef = useRef<string | null>(null)
  const isPausedRef = useRef(false)
  const pausedAtRef = useRef<number | null>(null)
  const totalPausedMsRef = useRef(0)
  const restRemainingAtPauseRef = useRef<number | null>(null)
  const sessionStartRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (isPausedRef.current) return
      forceUpdate(n => n + 1)
      if (restEndAtRef.current && Date.now() >= restEndAtRef.current && !restFiredRef.current) {
        restFiredRef.current = true
        restEndAtRef.current = null
        setShowRestDone(true)
        playBeep()
      }
    }, 500)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  useEffect(() => {
    const init = async () => {
      requestNotifPermission()
      const { data: day } = await supabase
        .from('workout_days')
        .select('exercises:workout_exercises(*, exercise:exercises(*))')
        .eq('id', dayId)
        .single()

      const sorted: Exercise[] = ((day?.exercises as any[]) || [])
        .sort((a, b) => a.sort_order - b.sort_order)
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

      const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
      if (student?.id) {
        studentIdRef.current = student.id
        subscribeWebPush(user!.id)
      }
      const { data: sess } = await supabase.from('training_sessions').insert({
        student_id: student!.id,
        workout_day_id: dayId,
        started_at: new Date().toISOString(),
      }).select().single()

      setSession(sess as any)
      sessionStartRef.current = new Date((sess as any).started_at).getTime()
      setLoading(false)
    }
    init()
  }, [dayId])

  const now = Date.now()
  const baseTime = sessionStartRef.current
  const elapsedMs = baseTime
    ? (isPausedRef.current && pausedAtRef.current ? pausedAtRef.current : now) - baseTime - totalPausedMsRef.current
    : 0
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const restRemaining = restEndAtRef.current ? Math.max(0, Math.floor((restEndAtRef.current - now) / 1000)) : 0
  const isResting = !!(restEndAtRef.current && now < restEndAtRef.current)

  const getEffectiveDuration = () => {
    if (!baseTime) return 0
    const n = Date.now()
    const currentPauseMs = isPausedRef.current && pausedAtRef.current ? n - pausedAtRef.current : 0
    return Math.max(0, Math.floor((n - baseTime - totalPausedMsRef.current - currentPauseMs) / 1000))
  }

  const cancelServerTimer = useCallback(() => {
    if (!studentIdRef.current) return
    const nonce = crypto.randomUUID()
    restNonceRef.current = nonce
    invalidateRestNonce(studentIdRef.current, nonce)
  }, [])

  const handlePauseResume = () => {
    if (isPausedRef.current) {
      if (pausedAtRef.current) {
        totalPausedMsRef.current += Date.now() - pausedAtRef.current
        pausedAtRef.current = null
      }
      if (restRemainingAtPauseRef.current !== null) {
        const remainingMs = restRemainingAtPauseRef.current
        restEndAtRef.current = Date.now() + remainingMs
        restRemainingAtPauseRef.current = null
        restFiredRef.current = false
        postToSW({ type: 'START_REST_TIMER', ms: remainingMs, exerciseName: restExerciseNameRef.current })
      }
      isPausedRef.current = false
      setIsPaused(false)
      setShowPauseOverlay(false)
    } else {
      pausedAtRef.current = Date.now()
      if (restEndAtRef.current) {
        restRemainingAtPauseRef.current = Math.max(0, restEndAtRef.current - Date.now())
        restEndAtRef.current = null
        postToSW({ type: 'CANCEL_REST_TIMER' })
        cancelServerTimer()
      }
      isPausedRef.current = true
      setIsPaused(true)
      setShowPauseOverlay(true)
    }
  }

  const startRestTimer = useCallback((seconds: number, exerciseName = '') => {
    restFiredRef.current = false
    restEndAtRef.current = Date.now() + seconds * 1000
    restExerciseNameRef.current = exerciseName
    postToSW({ type: 'START_REST_TIMER', ms: seconds * 1000, exerciseName })

    // Push via servidor (funciona com tela desligada)
    if (studentIdRef.current) {
      const nonce = crypto.randomUUID()
      restNonceRef.current = nonce
      invalidateRestNonce(studentIdRef.current, nonce)
      scheduleRestNotification(studentIdRef.current, exerciseName, seconds, nonce)
    }
  }, [])

  const completeSet = (exerciseId: string, setNumber: number) => {
    if (isPausedRef.current) return
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber ? { ...s, completed: true } : s
    ))
    const ex = exercises.find(e => e.exercise_id === exerciseId)
    startRestTimer(ex?.rest_seconds || 60, ex?.exercise?.name || '')
  }

  const uncompleteSet = (exerciseId: string, setNumber: number) => {
    if (isPausedRef.current) return
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber ? { ...s, completed: false } : s
    ))
  }

  const updateSet = (exerciseId: string, setNumber: number, field: 'weight' | 'repsDone', value: string) => {
    setSets(prev => prev.map(s =>
      s.exerciseId === exerciseId && s.setNumber === setNumber ? { ...s, [field]: value } : s
    ))
  }

  const finishWorkout = async () => {
    if (!session) return
    if (!window.confirm('Finalizar o treino agora?')) return
    if (tickRef.current) clearInterval(tickRef.current)
    postToSW({ type: 'CANCEL_REST_TIMER' })
    cancelServerTimer()
    const duration = getEffectiveDuration()

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
    navigate(`/student/workout/feedback/${session.id}`)
  }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  const currentEx = exercises[currentExIdx]
  if (!currentEx) return null
  const exSets = sets.filter(s => s.exerciseId === currentEx.exercise_id)
  const progress = ((currentExIdx + 1) / exercises.length) * 100

  const inputStyle = (completed: boolean): React.CSSProperties => ({
    backgroundColor: completed ? 'rgba(232,255,0,0.15)' : 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 6px',
    fontSize: 16,
    fontWeight: 700,
    color: completed ? '#E8FF00' : 'var(--text)',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  })

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', backgroundColor:'var(--bg)', overflow:'hidden', position:'relative' }}>

      {/* Overlay de pausa */}
      {showPauseOverlay && (
        <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(10,10,10,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
          <div style={{ width:'100%', maxWidth:340, backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:24, padding:32, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ width:72, height:72, borderRadius:36, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Pause size={36} color="#0A0A0A" />
            </div>
            <p style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:0 }}>Treino pausado</p>
            <p style={{ fontSize:42, fontWeight:900, color:'#E8FF00', margin:0, fontVariantNumeric:'tabular-nums' }}>{formatTime(elapsedSeconds)}</p>
            <button onClick={handlePauseResume}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#E8FF00', border:'none', borderRadius:14, padding:'16px', cursor:'pointer', fontSize:16, fontWeight:800, color:'#0A0A0A' }}>
              <Play size={20} color="#0A0A0A" /> Retomar treino
            </button>
            <button onClick={finishWorkout}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-2)', fontWeight:600, padding:8 }}>
              Finalizar mesmo assim
            </button>
          </div>
        </div>
      )}

      {/* Modal descanso concluído */}
      {showRestDone && (
        <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(10,10,10,0.82)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
          <div style={{ width:'100%', maxWidth:340, backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:24, padding:32, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ width:72, height:72, borderRadius:36, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Zap size={36} color="#0A0A0A" />
            </div>
            <p style={{ fontSize:26, fontWeight:900, color:'var(--text)', margin:0 }}>Descansou!</p>
            <p style={{ fontSize:15, color:'var(--text-2)', margin:0, textAlign:'center' }}>Hora da próxima série 💪</p>
            <button onClick={() => setShowRestDone(false)}
              style={{ width:'100%', backgroundColor:'#E8FF00', border:'none', borderRadius:14, padding:'16px', cursor:'pointer', fontSize:15, fontWeight:900, color:'#0A0A0A', letterSpacing:2 }}>
              CONTINUAR
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding:'14px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:'var(--text-2)', fontWeight:600 }}>{currentExIdx + 1} / {exercises.length}</span>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <Timer size={13} color="#E8FF00" />
              <span style={{ fontSize:12, color:'#E8FF00', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
          <div style={{ height:3, backgroundColor:'var(--border)', borderRadius:2 }}>
            <div style={{ height:3, backgroundColor:'#E8FF00', borderRadius:2, width:`${progress}%`, transition:'width 0.3s' }} />
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={handlePauseResume}
            style={{ width:36, height:36, borderRadius:10, border:'1px solid var(--border)', background:'none', cursor:'pointer', color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={finishWorkout}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'var(--text-2)', fontWeight:600, padding:'0 4px' }}>
            Finalizar
          </button>
        </div>
      </div>

      {/* Banner de descanso */}
      {isResting && !isPaused && (
        <div style={{ display:'flex', alignItems:'center', gap:8, backgroundColor:'rgba(232,255,0,0.07)', borderBottom:'1px solid rgba(232,255,0,0.2)', padding:'10px 20px', flexShrink:0 }}>
          <Timer size={16} color="#E8FF00" />
          <span style={{ flex:1, fontSize:14, color:'#E8FF00', fontWeight:700 }}>Descanso: {restRemaining}s</span>
          <button onClick={() => { restFiredRef.current = true; restEndAtRef.current = null; postToSW({ type: 'CANCEL_REST_TIMER' }); cancelServerTimer(); forceUpdate(n => n + 1) }}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-2)', fontWeight:600 }}>Pular</button>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ padding:'20px 20px 120px' }}>
          <h2 style={{ fontSize:26, fontWeight:900, color:'var(--text)', margin:'0 0 4px' }}>{currentEx.exercise?.name}</h2>
          {(currentEx.exercise?.muscle_groups?.length ?? 0) > 0 && (
            <p style={{ fontSize:13, color:'var(--text-2)', margin:'0 0 2px' }}>{currentEx.exercise.muscle_groups!.join(', ')}</p>
          )}
          <p style={{ fontSize:13, color:'var(--text-2)', margin:'0 0 16px' }}>
            {currentEx.sets} séries · {currentEx.reps} reps · {currentEx.rest_seconds}s descanso
          </p>

          {currentEx.coach_notes && (
            <div style={{ display:'flex', gap:8, alignItems:'flex-start', backgroundColor:'rgba(232,255,0,0.07)', borderRadius:10, padding:12, marginBottom:16 }}>
              <span style={{ color:'#E8FF00', fontSize:14, flexShrink:0 }}>ℹ</span>
              <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.6 }}>{currentEx.coach_notes}</p>
            </div>
          )}

          {/* Tabela de séries */}
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 1fr 44px', padding:'10px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              {['Série','Carga (kg)','Reps',''].map((h, i) => (
                <span key={i} style={{ fontSize:11, color:'var(--text-2)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
              ))}
            </div>
            {exSets.map(s => (
              <div key={s.setNumber}
                style={{ display:'grid', gridTemplateColumns:'36px 1fr 1fr 44px', padding:'10px 16px', borderBottom:'1px solid var(--border)', gap:8, alignItems:'center', backgroundColor: s.completed ? 'rgba(232,255,0,0.04)' : 'transparent' }}>
                <span style={{ fontSize:16, fontWeight:700, color: s.completed ? '#E8FF00' : 'var(--text-2)', textAlign:'center' }}>{s.setNumber}</span>
                <input type="number" value={s.weight}
                  onChange={e => updateSet(s.exerciseId, s.setNumber, 'weight', e.target.value)}
                  placeholder="—" disabled={isPaused}
                  style={inputStyle(s.completed)} />
                <input type="number" value={s.repsDone}
                  onChange={e => updateSet(s.exerciseId, s.setNumber, 'repsDone', e.target.value)}
                  placeholder={currentEx.reps} disabled={isPaused}
                  style={inputStyle(s.completed)} />
                <button
                  onClick={() => s.completed ? uncompleteSet(s.exerciseId, s.setNumber) : completeSet(s.exerciseId, s.setNumber)}
                  disabled={isPaused}
                  style={{ width:36, height:36, borderRadius:18, border: s.completed ? 'none' : '2px solid var(--border)', backgroundColor: s.completed ? '#E8FF00' : 'transparent', cursor: isPaused ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'#0A0A0A', opacity: isPaused ? 0.5 : 1 }}>
                  {s.completed ? '✓' : ''}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer navegação */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, display:'flex', gap:12, padding:'14px 20px', borderTop:'1px solid var(--border)', backgroundColor:'var(--bg)' }}>
        <button onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0}
          style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, border:'1px solid var(--border)', borderRadius:12, padding:'13px', background:'none', cursor: currentExIdx === 0 ? 'not-allowed' : 'pointer', color: currentExIdx === 0 ? 'var(--border)' : 'var(--text)', fontWeight:700, fontSize:14, opacity: currentExIdx === 0 ? 0.4 : 1 }}>
          <ChevronLeft size={20} /> Anterior
        </button>
        {currentExIdx < exercises.length - 1 ? (
          <button onClick={() => !isPaused && setCurrentExIdx(i => Math.min(exercises.length - 1, i + 1))} disabled={isPaused}
            style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#E8FF00', border:'none', borderRadius:12, padding:'13px', cursor: isPaused ? 'not-allowed' : 'pointer', fontWeight:800, fontSize:15, color:'#0A0A0A', letterSpacing:1, opacity: isPaused ? 0.5 : 1 }}>
            Próximo <ChevronRight size={20} color="#0A0A0A" />
          </button>
        ) : (
          <button onClick={finishWorkout}
            style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#E8FF00', border:'none', borderRadius:12, padding:'13px', cursor:'pointer', fontWeight:800, fontSize:15, color:'#0A0A0A', letterSpacing:1 }}>
            Finalizar <Flag size={20} color="#0A0A0A" />
          </button>
        )}
      </div>
    </div>
  )
}
