import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Search, X, ChevronDown, Save, Youtube, Dumbbell } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Exercise { id: string; name: string; muscle_groups: string[]; youtube_url?: string; equipment?: string }
interface TemplateExercise { exercise_id: string; exercise?: Exercise; sets: number; reps: string; rest_seconds: number; coach_notes: string; sort_order: number }
interface TemplateDay { id?: string; name: string; weekday_suggestion: number[]; exercises: TemplateExercise[]; collapsed: boolean }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ width: '100%', padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', ...extra })
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }

export default function TemplateBuilder() {
  const { templateId } = useParams()
  const navigate = useNavigate()

  const [templateName, setTemplateName] = useState('')
  const [days, setDays] = useState<TemplateDay[]>([{ name: 'A', weekday_suggestion: [], exercises: [], collapsed: false }])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [exerciseSearch, setExerciseSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Exercise[]>([])
  const [activePickerDay, setActivePickerDay] = useState<number | null>(null)
  const [allExercises, setAllExercises] = useState<Exercise[]>([])

  useEffect(() => { init() }, [templateId])

  useEffect(() => {
    if (!exerciseSearch.trim()) { setSearchResults(allExercises.slice(0, 8)); return }
    const q = exerciseSearch.toLowerCase()
    setSearchResults(allExercises.filter(e =>
      e.name.toLowerCase().includes(q) || e.muscle_groups.some(m => m.toLowerCase().includes(q))
    ).slice(0, 8))
  }, [exerciseSearch, allExercises])

  const init = async () => {
    const [tplRes, exRes] = await Promise.all([
      supabase.from('workout_templates').select('name').eq('id', templateId!).single(),
      supabase.from('exercises').select('*').eq('active', true).order('name'),
    ])
    if (tplRes.data) setTemplateName(tplRes.data.name)

    const exercises = exRes.data || []
    setAllExercises(exercises)
    setSearchResults(exercises.slice(0, 8))

    const { data: daysData } = await supabase
      .from('template_days')
      .select(`id, name, weekday_suggestion, sort_order,
        exercises:template_exercises(exercise_id, sets, reps, rest_seconds, coach_notes, sort_order,
          exercise:exercises(id, name, muscle_groups, youtube_url, equipment))`)
      .eq('template_id', templateId!)
      .order('sort_order')

    if (daysData && daysData.length > 0) {
      const loaded: TemplateDay[] = (daysData as any[]).map(d => ({
        id: d.id,
        name: d.name,
        weekday_suggestion: d.weekday_suggestion || [],
        collapsed: false,
        exercises: (d.exercises as any[])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(ex => ({
            exercise_id: ex.exercise_id,
            exercise: ex.exercise,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            coach_notes: ex.coach_notes || '',
            sort_order: ex.sort_order,
          })),
      }))
      setDays(loaded)
    }

    setLoading(false)
  }

  const addDay = () => {
    const letters = 'ABCDEFGHIJKLMNOP'
    setDays(prev => [...prev, { name: letters[prev.length] || `${prev.length + 1}`, weekday_suggestion: [], exercises: [], collapsed: false }])
  }
  const removeDay = (i: number) => setDays(prev => prev.filter((_, idx) => idx !== i))
  const toggleCollapse = (i: number) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, collapsed: !d.collapsed } : d))
  const updateDayName = (i: number, name: string) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, name } : d))
  const toggleWeekday = (di: number, wd: number) => setDays(prev => prev.map((d, i) => i !== di ? d : {
    ...d, weekday_suggestion: d.weekday_suggestion.includes(wd)
      ? d.weekday_suggestion.filter(x => x !== wd)
      : [...d.weekday_suggestion, wd],
  }))

  const addExercise = (di: number, exercise: Exercise) => {
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d, exercises: [...d.exercises, { exercise_id: exercise.id, exercise, sets: 3, reps: '10-12', rest_seconds: 60, coach_notes: '', sort_order: d.exercises.length }],
    }))
    setActivePickerDay(null); setExerciseSearch('')
  }
  const removeExercise = (di: number, ei: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, exercises: d.exercises.filter((_, j) => j !== ei) }))
  const updateField = (di: number, ei: number, field: keyof TemplateExercise, value: any) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, exercises: d.exercises.map((ex, j) => j !== ei ? ex : { ...ex, [field]: value }) }))

  const handleSave = async () => {
    if (days.some(d => d.exercises.length === 0)) {
      alert('Todas as divisões precisam ter pelo menos 1 exercício.')
      return
    }
    setSaving(true)
    try {
      // Delete all existing days (cascade deletes exercises)
      await supabase.from('template_days').delete().eq('template_id', templateId!)

      // Insert days + exercises
      for (const [di, day] of days.entries()) {
        const { data: wd } = await supabase
          .from('template_days')
          .insert({ template_id: templateId!, name: day.name, weekday_suggestion: day.weekday_suggestion, sort_order: di })
          .select()
          .single()

        if (day.exercises.length > 0) {
          await supabase.from('template_exercises').insert(
            day.exercises.map((ex, ei) => ({
              template_day_id: wd!.id,
              exercise_id: ex.exercise_id,
              sets: ex.sets,
              reps: ex.reps,
              rest_seconds: ex.rest_seconds,
              coach_notes: ex.coach_notes || null,
              sort_order: ei,
            }))
          )
        }
      }

      navigate('/admin/templates')
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 760 }}>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dumbbell size={13} /> Template de treino
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{templateName}</h1>
        </div>

        {/* Divisões */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {days.map((day, di) => (
            <div key={di} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 900, color: '#0A0A0A' }}>
                  {day.name.charAt(0)}
                </div>
                <input type="text" value={day.name} onChange={e => updateDayName(di, e.target.value)}
                  style={{ fontWeight: 700, color: 'var(--text)', backgroundColor: 'transparent', border: 'none', outline: 'none', width: 120, fontSize: 14 }}
                  placeholder="Nome da divisão" />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {WEEKDAYS.map((wd, wdi) => (
                    <button key={wdi} onClick={() => toggleWeekday(di, wdi)}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', border: 'none', backgroundColor: day.weekday_suggestion.includes(wdi) ? '#E8FF00' : '#1E1E1E', color: day.weekday_suggestion.includes(wdi) ? '#0A0A0A' : '#888' }}>
                      {wd}
                    </button>
                  ))}
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)' }}>{day.exercises.length} ex.</span>
                <button onClick={() => toggleCollapse(di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                  <ChevronDown size={18} style={{ transform: day.collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
                </button>
                {days.length > 1 && (
                  <button onClick={() => removeDay(di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {!day.collapsed && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {day.exercises.map((ex, ei) => (
                    <div key={ei} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{ex.exercise?.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{ex.exercise?.muscle_groups?.join(', ')}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {ex.exercise?.youtube_url && (
                            <a href={ex.exercise.youtube_url} target="_blank" rel="noopener noreferrer" style={{ color: '#FF4444' }}>
                              <Youtube size={15} />
                            </a>
                          )}
                          <button onClick={() => removeExercise(di, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Séries</label>
                          <input type="number" value={ex.sets} onChange={e => updateField(di, ei, 'sets', parseInt(e.target.value) || 1)}
                            style={{ width: 64, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Reps / Tempo</label>
                          <input type="text" value={ex.reps} onChange={e => updateField(di, ei, 'reps', e.target.value)} placeholder="10-12"
                            style={{ width: 90, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Descanso (s)</label>
                          <input type="number" value={ex.rest_seconds} onChange={e => updateField(di, ei, 'rest_seconds', parseInt(e.target.value) || 30)}
                            style={{ width: 80, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <label style={{ ...lbl, fontSize: 10 }}>Observação</label>
                          <input type="text" value={ex.coach_notes} onChange={e => updateField(di, ei, 'coach_notes', e.target.value)} placeholder="Dicas, cuidados..."
                            style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                      </div>
                    </div>
                  ))}

                  {activePickerDay === di ? (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                        <Search size={14} color="#888" />
                        <input autoFocus type="text" value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} placeholder="Buscar exercício..."
                          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                        <button onClick={() => setActivePickerDay(null)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2 }}>
                          <X size={16} />
                        </button>
                      </div>
                      <div style={{ maxHeight: 210, overflowY: 'auto' }}>
                        {searchResults.length === 0 ? (
                          <p style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhum exercício encontrado.</p>
                        ) : searchResults.map(ex => (
                          <button key={ex.id} onClick={() => addExercise(di, ex)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1E1E1E')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{ex.name}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{ex.muscle_groups.join(', ')}</p>
                            </div>
                            {ex.equipment && <span style={{ fontSize: 11, color: 'var(--text-2)', backgroundColor: 'var(--border)', padding: '2px 8px', borderRadius: 20 }}>{ex.equipment}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <DashedBtn onClick={() => { setActivePickerDay(di); setExerciseSearch('') }}>
                      <Plus size={15} /> Adicionar exercício
                    </DashedBtn>
                  )}
                </div>
              )}
            </div>
          ))}

          <DashedBtn onClick={addDay}><Plus size={15} /> Adicionar divisão</DashedBtn>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <OutlineBtn onClick={() => navigate('/admin/templates')}>Cancelar</OutlineBtn>
          <SaveBtn onClick={handleSave} saving={saving}>Salvar Template</SaveBtn>
        </div>
      </div>
    </div>
  )
}

function DashedBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', padding: '12px 0', border: `1px dashed ${hovered ? '#E8FF00' : '#3A3A3A'}`, borderRadius: 12, backgroundColor: 'transparent', color: hovered ? 'var(--text)' : '#888', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}

function OutlineBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ padding: '12px 24px', border: '1px solid var(--border)', borderRadius: 12, backgroundColor: 'transparent', color: hovered ? 'var(--text)' : '#888', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}

function SaveBtn({ children, onClick, saving }: { children: React.ReactNode; onClick: () => void; saving: boolean }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', backgroundColor: '#E8FF00', border: 'none', borderRadius: 12, color: '#0A0A0A', fontSize: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
      {saving
        ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        : <><Save size={16} />{children}</>}
    </button>
  )
}
