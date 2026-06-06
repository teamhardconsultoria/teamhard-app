import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Dumbbell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Exercise { id: string; name: string; sets: number; reps: string; rest_seconds?: number; notes?: string; order?: number }
interface WorkoutDay { id: string; name: string; sort_order: number; weekday_suggestion?: number[]; exercises: Exercise[] }
interface Workout { id: string; name: string; valid_from: string; valid_to: string; days: WorkoutDay[] }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const spin = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

export default function StudentWorkout() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    const { data } = await supabase.from('workouts').select(`
      id, name, valid_from, valid_to,
      days:workout_days(
        id, name, sort_order, weekday_suggestion,
        exercises:workout_exercises(id, sets, reps, rest_seconds, notes:coach_notes, sort_order, exercise:exercises(name))
      )
    `).eq('student_id', student.id).eq('active', true).order('valid_from', { ascending: false }).limit(1).maybeSingle()
    setWorkout(data as any)
    if (data?.days) {
      const todayIdx = new Date().getDay()
      const todayDay = (data.days as any[]).find(d => d.weekday_suggestion?.includes(todayIdx))
      if (todayDay) setExpanded(new Set([todayDay.id]))
      else if (data.days.length > 0) setExpanded(new Set([(data.days as any[])[0].id]))
    }
    setLoading(false)
  }

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const pad = isMobile ? '20px 16px 48px' : '40px 32px 48px'

  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}><div style={spin} /></div>

  if (!workout) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', gap:12 }}>
      <Dumbbell size={48} color="var(--border)" />
      <p style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>Sem treino ativo</p>
      <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>Aguarde seu coach criar seu treino.</p>
    </div>
  )

  const todayIdx = new Date().getDay()

  return (
    <div style={{ flex:1, overflowY:'auto', backgroundColor:'var(--bg)' }}>
      <div style={{ padding: pad, maxWidth: 720 }}>
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:'0 0 4px' }}>{workout.name}</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>
            Válido de {new Date(workout.valid_from + 'T12:00:00').toLocaleDateString('pt-BR')} até {new Date(workout.valid_to + 'T12:00:00').toLocaleDateString('pt-BR')}
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {workout.days?.sort((a, b) => a.sort_order - b.sort_order).map(day => {
            const isOpen = expanded.has(day.id)
            const isToday = day.weekday_suggestion?.includes(todayIdx)
            return (
              <div key={day.id} style={{ backgroundColor:'var(--surface)', border:`1px solid ${isToday ? 'rgba(232,255,0,0.4)' : 'var(--border)'}`, borderRadius:14 }}>
                <button onClick={() => toggle(day.id)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:36, height:36, borderRadius:9, backgroundColor: isToday ? '#E8FF00' : 'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Dumbbell size={18} color={isToday ? '#0A0A0A' : 'var(--text-2)'} />
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{day.name}</p>
                    <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0' }}>
                      {day.weekday_suggestion?.map(i => WEEKDAYS[i]).join(', ')} · {day.exercises?.length || 0} exercício{day.exercises?.length !== 1 ? 's' : ''}
                      {isToday && <span style={{ marginLeft:8, color:'#E8FF00', fontWeight:700 }}>• Hoje</span>}
                    </p>
                  </div>
                  {isOpen ? <ChevronDown size={18} color="var(--text-2)" /> : <ChevronRight size={18} color="var(--text-2)" />}
                </button>

                {isOpen && day.exercises && day.exercises.length > 0 && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                    {day.exercises.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((ex, idx) => (
                      <div key={ex.id} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                        <span style={{ width:22, height:22, borderRadius:11, backgroundColor:'var(--bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--text-2)', flexShrink:0, marginTop:2 }}>{idx + 1}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:'0 0 4px' }}>{(ex as any).exercise?.name || ex.name}</p>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            <Chip>{ex.sets}x{ex.reps}</Chip>
                            {ex.rest_seconds && <Chip>Descanso: {ex.rest_seconds}s</Chip>}
                          </div>
                          {ex.notes && <p style={{ fontSize:12, color:'var(--text-2)', margin:'6px 0 0', fontStyle:'italic' }}>{ex.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', backgroundColor:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 8px' }}>{children}</span>
}
