import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Clock, Dumbbell, Flame } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface SessionSet {
  exercise_id: string; exerciseName: string
  sets: { set_number: number; weight_used?: number; reps_done?: number }[]
}
interface Session {
  id: string; started_at: string; finished_at: string; duration_seconds?: number
  dayName: string; workoutName: string
  feedback?: { fatigue_level: number; has_pain: boolean; notes?: string }
  exercises: SessionSet[]
}

const FATIGUE_LABELS: Record<number, string> = { 1: 'Muito leve', 2: 'Leve', 3: 'Moderado', 4: 'Intenso', 5: 'Exaustivo' }
const FATIGUE_COLORS: Record<number, string> = { 1: '#00C853', 2: '#00C853', 3: '#FF9800', 4: '#FF9800', 5: '#FF4444' }
const spin = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

function formatDuration(secs?: number) {
  if (!secs) return null
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function SessionHistory() {
  const { id: studentId } = useParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => { fetchData() }, [studentId])

  const fetchData = async () => {
    const { data: student } = await supabase.from('students').select('user:users(name)').eq('id', studentId).single()
    if (student) setStudentName((student.user as any).name)

    const { data: rawSessions } = await supabase
      .from('training_sessions')
      .select('id, started_at, finished_at, duration_seconds, day:workout_days(name, workout:workouts(name))')
      .eq('student_id', studentId).not('finished_at', 'is', null).order('finished_at', { ascending: false })

    if (!rawSessions) { setLoading(false); return }

    const full: Session[] = await Promise.all(rawSessions.map(async (s: any) => {
      const day = Array.isArray(s.day) ? s.day[0] : s.day
      const workout = Array.isArray(day?.workout) ? day?.workout[0] : day?.workout
      const [setsRes, fbRes] = await Promise.all([
        supabase.from('session_sets').select('set_number, weight_used, reps_done, exercise:exercises(id, name)').eq('session_id', s.id).order('set_number'),
        supabase.from('training_feedbacks').select('fatigue_level, has_pain, notes').eq('session_id', s.id).maybeSingle(),
      ])
      const exerciseMap: Record<string, SessionSet> = {}
      for (const set of setsRes.data || []) {
        const ex = Array.isArray(set.exercise) ? set.exercise[0] : set.exercise
        if (!ex) continue
        if (!exerciseMap[ex.id]) exerciseMap[ex.id] = { exercise_id: ex.id, exerciseName: ex.name, sets: [] }
        exerciseMap[ex.id].sets.push({ set_number: set.set_number, weight_used: set.weight_used != null ? Number(set.weight_used) : undefined, reps_done: set.reps_done ?? undefined })
      }
      return { id: s.id, started_at: s.started_at, finished_at: s.finished_at, duration_seconds: s.duration_seconds, dayName: day?.name || '?', workoutName: workout?.name || 'Treino', feedback: fbRes.data || undefined, exercises: Object.values(exerciseMap) }
    }))

    setSessions(full)
    if (full.length > 0) setExpanded({ [full[0].id]: true })
    setLoading(false)
  }

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 720 }}>

        <button onClick={() => navigate(`/coach/students/${studentId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 28, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ArrowLeft size={15} /> Voltar para {studentName || 'Aluno'}
        </button>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Histórico de treinos de</p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
          {!loading && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0 0' }}>{sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''} concluída{sessions.length !== 1 ? 's' : ''}</p>}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div style={spin} /></div>
        ) : sessions.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Dumbbell size={22} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhuma sessão registrada</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '6px 0 0' }}>O aluno ainda não completou nenhum treino pelo app.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map((session, idx) => (
              <div key={session.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <button onClick={() => toggle(session.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161616')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'var(--accent-text)', fontSize: 11, fontWeight: 900 }}>{sessions.length - idx}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{session.workoutName}</p>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', backgroundColor: 'var(--border)', padding: '2px 8px', borderRadius: 20 }}>Divisão {session.dayName}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0', textTransform: 'capitalize' }}>{formatDate(session.finished_at)}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{formatTime(session.started_at)} → {formatTime(session.finished_at)}</span>
                        {session.duration_seconds && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                            <Clock size={10} />{formatDuration(session.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                    {session.feedback && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Flame size={13} color={FATIGUE_COLORS[session.feedback.fatigue_level]} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: FATIGUE_COLORS[session.feedback.fatigue_level] }}>{FATIGUE_LABELS[session.feedback.fatigue_level]}</span>
                      </div>
                    )}
                    <ChevronDown size={16} color="#888" style={{ transform: expanded[session.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </button>

                {expanded[session.id] && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {session.exercises.length === 0 ? (
                      <p style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-2)' }}>Nenhuma série registrada nesta sessão.</p>
                    ) : (
                      <div>
                        {session.exercises.map(ex => (
                          <div key={ex.exercise_id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px 0' }}>{ex.exerciseName}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {ex.sets.map(set => (
                                <div key={set.set_number} style={{ backgroundColor: 'var(--bg)', borderRadius: 10, padding: '8px 12px', textAlign: 'center', minWidth: 72 }}>
                                  <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 4px 0' }}>Série {set.set_number}</p>
                                  {set.weight_used != null && <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{set.weight_used} kg</p>}
                                  {set.reps_done != null && <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{set.reps_done} rep</p>}
                                  {set.weight_used == null && set.reps_done == null && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>—</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {session.feedback && (
                      <div style={{ margin: '0 20px 16px', padding: '10px 14px', backgroundColor: 'var(--bg)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flame size={13} color={FATIGUE_COLORS[session.feedback.fatigue_level]} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: FATIGUE_COLORS[session.feedback.fatigue_level] }}>
                            Fadiga: {FATIGUE_LABELS[session.feedback.fatigue_level]}
                          </span>
                          {session.feedback.has_pain && <span style={{ fontSize: 12, color: '#FF4444', fontWeight: 600 }}>· Relatou dor</span>}
                        </div>
                        {session.feedback.notes && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '6px 0 0 0' }}>"{session.feedback.notes}"</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
