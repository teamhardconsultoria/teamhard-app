import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronDown, Clock, ToggleLeft, ToggleRight, Dumbbell, Pencil, LayoutList, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Template { id: string; name: string; description?: string; dayCount: number }

interface WorkoutExercise {
  id: string; sets: number; reps: string; rest_seconds: number
  coach_notes?: string; sort_order: number
  exercise: { name: string; muscle_groups: string[] }
}
interface WorkoutDay {
  id: string; name: string; weekday_suggestion: number[]
  sort_order: number; exercises: WorkoutExercise[]; sessionCount: number
}
interface Workout {
  id: string; name: string; valid_from: string; valid_to: string
  active: boolean; created_at: string; days: WorkoutDay[]
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const spin = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function WorkoutList() {
  const { id: studentId } = useParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  useEffect(() => { fetchData() }, [studentId])

  const fetchData = async () => {
    const { data: student } = await supabase.from('students').select('user:users(name)').eq('id', studentId).single()
    if (student) setStudentName((student.user as any).name)

    const { data: wList } = await supabase.from('workouts').select('id, name, valid_from, valid_to, active, created_at').eq('student_id', studentId).order('created_at', { ascending: false })
    if (!wList) { setLoading(false); return }

    const full: Workout[] = await Promise.all(wList.map(async (w) => {
      const { data: days } = await supabase.from('workout_days').select('id, name, weekday_suggestion, sort_order').eq('workout_id', w.id).order('sort_order')
      const daysWithExercises: WorkoutDay[] = await Promise.all((days || []).map(async (d) => {
        const { data: exs } = await supabase.from('workout_exercises').select('id, sets, reps, rest_seconds, coach_notes, sort_order, exercise:exercises(name, muscle_groups)').eq('workout_day_id', d.id).order('sort_order')
        const { count } = await supabase.from('training_sessions').select('id', { count: 'exact', head: true }).eq('workout_day_id', d.id)
        return { ...d, exercises: (exs || []).map((e: any) => ({ ...e, exercise: e.exercise })), sessionCount: count || 0 }
      }))
      return { ...w, days: daysWithExercises }
    }))

    setWorkouts(full)
    if (full.length > 0) setExpanded({ [full[0].id]: true })
    setLoading(false)
  }

  const openNewWorkout = async () => {
    setTemplatesLoading(true)
    setShowTemplateModal(true)
    const { data } = await supabase
      .from('workout_templates')
      .select('id, name, description, days:template_days(id)')
      .eq('active', true)
      .order('name')
    const list: Template[] = (data || []).map((t: any) => ({
      id: t.id, name: t.name, description: t.description, dayCount: t.days?.length || 0,
    }))
    setTemplates(list)
    setTemplatesLoading(false)
  }

  const selectTemplate = (templateId: string) => {
    setShowTemplateModal(false)
    navigate(`/coach/students/${studentId}/workout/new?templateId=${templateId}`)
  }

  const startFromScratch = () => {
    setShowTemplateModal(false)
    navigate(`/coach/students/${studentId}/workout/new`)
  }

  const toggleActive = async (workout: Workout) => {
    await supabase.from('workouts').update({ active: !workout.active }).eq('id', workout.id)
    setWorkouts(prev => prev.map(w => w.id === workout.id ? { ...w, active: !w.active } : w))
  }

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 760 }}>

        <button onClick={() => navigate(`/coach/students/${studentId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 28, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ArrowLeft size={15} /> Voltar para {studentName || 'Aluno'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Treinos de</p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
          </div>
          <button onClick={openNewWorkout}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}>
            <Plus size={16} /> Novo Treino
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div style={spin} /></div>
        ) : workouts.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Dumbbell size={22} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhum treino criado</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '6px 0 20px' }}>Crie o primeiro treino para este aluno.</p>
            <button onClick={openNewWorkout}
              style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> Criar Treino
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {workouts.map(workout => (
              <WorkoutCard key={workout.id} workout={workout} expanded={!!expanded[workout.id]}
                onToggleExpand={() => toggleExpand(workout.id)}
                onToggleActive={() => toggleActive(workout)}
                onEdit={() => navigate(`/coach/students/${studentId}/workout/${workout.id}/edit`)}
                formatDate={formatDate} />
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Modal de escolha: template ou do zero */}
    {showTemplateModal && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Novo Treino</h2>
            <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Opção: do zero */}
            <OptionCard
              icon={<Plus size={20} color="#E8FF00" />}
              title="Começar do zero"
              description="Monte o treino manualmente, adicionando divisões e exercícios."
              onClick={startFromScratch}
            />

            {/* Separador */}
            {(templatesLoading || templates.length > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>ou use um template</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
              </div>
            )}

            {/* Lista de templates */}
            {templatesLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div style={{ width: 24, height: 24, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : templates.length === 0 ? null : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => (
                  <TemplateOption key={t.id} template={t} onSelect={() => selectTemplate(t.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function OptionCard({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, backgroundColor: hovered ? 'var(--surface-hover)' : 'var(--bg)', border: `1px solid ${hovered ? '#E8FF0044' : 'var(--border)'}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{description}</p>
      </div>
    </button>
  )
}

function TemplateOption({ template: t, onSelect }: { template: Template; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onSelect} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', backgroundColor: hovered ? 'var(--surface-hover)' : 'var(--bg)', border: `1px solid ${hovered ? '#E8FF0044' : 'var(--border)'}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(232,255,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <LayoutList size={16} color="#E8FF00" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t.name}</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0 0' }}>
          {t.dayCount} divisão{t.dayCount !== 1 ? 'ões' : ''}
          {t.description ? ` · ${t.description}` : ''}
        </p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#E8FF00', flexShrink: 0 }}>Usar →</span>
    </button>
  )
}

function WorkoutCard({ workout, expanded, onToggleExpand, onToggleActive, onEdit, formatDate }: {
  workout: Workout; expanded: boolean; onToggleExpand: () => void; onToggleActive: () => void; onEdit: () => void; formatDate: (d: string) => string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', opacity: workout.active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 12 }}>
        <button onClick={onToggleExpand} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workout.name}</p>
              {workout.active && <span style={{ fontSize: 10, fontWeight: 900, color: '#00C853', backgroundColor: 'rgba(0,200,83,0.1)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>ATIVO</span>}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>
              {formatDate(workout.valid_from)} → {formatDate(workout.valid_to)} · {workout.days.length} divisão{workout.days.length !== 1 ? 'ões' : ''}
            </p>
          </div>
          <ChevronDown size={16} color="#888" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </button>

        <button onClick={onEdit}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '5px 8px', borderRadius: 8, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
          <Pencil size={15} /> Editar
        </button>
        <button onClick={onToggleActive}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: workout.active ? '#E8FF00' : '#888', padding: '5px 8px', borderRadius: 8, flexShrink: 0 }}>
          {workout.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {workout.active ? 'Ativo' : 'Inativo'}
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {workout.days.map((day, dayIdx) => (
            <div key={day.id} style={{ borderBottom: dayIdx < workout.days.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>{day.name}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Divisão {day.name}</p>
                    {day.weekday_suggestion.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '1px 0 0 0' }}>{day.weekday_suggestion.map(d => WEEKDAYS[d]).join(', ')}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-2)' }}>
                  <span>{day.exercises.length} exercício{day.exercises.length !== 1 ? 's' : ''}</span>
                  {day.sessionCount > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />{day.sessionCount}x executado
                    </span>
                  )}
                </div>
              </div>

              {day.exercises.map((ex, exIdx) => (
                <ExerciseRow key={ex.id} ex={ex} index={exIdx} />
              ))}
              {day.exercises.length === 0 && (
                <p style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-2)' }}>Nenhum exercício nesta divisão.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExerciseRow({ ex, index }: { ex: WorkoutExercise; index: number }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 20px', backgroundColor: hovered ? '#161616' : 'transparent', borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s' }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', width: 16, flexShrink: 0, paddingTop: 2 }}>{index + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{ex.exercise.name}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {ex.exercise.muscle_groups.map(m => (
            <span key={m} style={{ fontSize: 10, backgroundColor: 'var(--border)', color: 'var(--text-2)', padding: '2px 7px', borderRadius: 20 }}>{m}</span>
          ))}
        </div>
        {ex.coach_notes && <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '4px 0 0 0', fontStyle: 'italic' }}>{ex.coach_notes}</p>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{ex.sets}×{ex.reps}</p>
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{ex.rest_seconds}s</p>
      </div>
    </div>
  )
}
