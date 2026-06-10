import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Search, X, ChevronDown, Save, Youtube, LayoutList, Timer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { sendPushToStudent } from '../../lib/push'
import { sendAutoMessage } from '../../lib/autoMessage'

interface Exercise { id: string; name: string; muscle_groups: string[]; youtube_url?: string; equipment?: string }
interface WorkoutExercise { exercise_id: string; exercise?: Exercise; sets: number; reps: string; rest_seconds: number; coach_notes: string; sort_order: number }
interface CardioItem { modality: string; duration_min: number; intensity: string; distance_km: string; notes: string; sort_order: number }
interface WorkoutDay { id?: string; name: string; weekday_suggestion: number[]; exercises: WorkoutExercise[]; cardio: CardioItem[]; collapsed: boolean }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const CARDIO_MODALITIES = ['corrida', 'caminhada', 'bike', 'elíptico', 'natação', 'remo', 'pular corda', 'HIIT', 'outro']
const CARDIO_INTENSITY = [
  { value: 'leve', label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'intensa', label: 'Intensa' },
]

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ width: '100%', padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', ...extra })
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }

const emptyCardio = (sortOrder: number): CardioItem => ({ modality: 'corrida', duration_min: 30, intensity: 'moderada', distance_km: '', notes: '', sort_order: sortOrder })

export default function WorkoutBuilder() {
  const { id: studentId, workoutId } = useParams()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId')
  const isEditing = !!workoutId
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [studentName, setStudentName] = useState('')
  const [workoutName, setWorkoutName] = useState('')
  const [periodization, setPeriodization] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0])
  const [validTo, setValidTo] = useState('')
  const [days, setDays] = useState<WorkoutDay[]>([{ name: 'A', weekday_suggestion: [], exercises: [], cardio: [], collapsed: false }])
  const [originalDayIds, setOriginalDayIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [exerciseSearch, setExerciseSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Exercise[]>([])
  const [activePickerDay, setActivePickerDay] = useState<number | null>(null)
  const [allExercises, setAllExercises] = useState<Exercise[]>([])

  useEffect(() => {
    fetchStudent()
    fetchExercises()
    if (isEditing) fetchWorkout()
    else if (templateId) fetchTemplate(templateId)
  }, [studentId])

  useEffect(() => {
    if (!exerciseSearch.trim()) { setSearchResults(allExercises.slice(0, 8)); return }
    const q = exerciseSearch.toLowerCase()
    setSearchResults(allExercises.filter(e => e.name.toLowerCase().includes(q) || e.muscle_groups.some(m => m.toLowerCase().includes(q))).slice(0, 8))
  }, [exerciseSearch, allExercises])

  const fetchWorkout = async () => {
    const { data: w } = await supabase.from('workouts').select(`
      id, name, periodization, valid_from, valid_to,
      days:workout_days(id, name, weekday_suggestion, sort_order,
        exercises:workout_exercises(exercise_id, sets, reps, rest_seconds, coach_notes, sort_order,
          exercise:exercises(id, name, muscle_groups, youtube_url, equipment)),
        cardio:workout_cardio(modality, duration_min, intensity, distance_km, notes, sort_order))
    `).eq('id', workoutId!).single()
    if (!w) return
    setWorkoutName(w.name)
    setPeriodization((w as any).periodization || '')
    setValidFrom(w.valid_from)
    setValidTo(w.valid_to)
    const loadedDays: WorkoutDay[] = (w.days as any[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(d => ({
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
        cardio: ((d.cardio as any[]) || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(c => ({
            modality: c.modality,
            duration_min: c.duration_min,
            intensity: c.intensity,
            distance_km: c.distance_km?.toString() ?? '',
            notes: c.notes || '',
            sort_order: c.sort_order,
          })),
      }))
    setDays(loadedDays)
    setOriginalDayIds(loadedDays.map(d => d.id!))
  }

  const fetchTemplate = async (tplId: string) => {
    const [tplRes, daysRes] = await Promise.all([
      supabase.from('workout_templates').select('name').eq('id', tplId).single(),
      supabase.from('template_days')
        .select(`id, name, weekday_suggestion, sort_order,
          exercises:template_exercises(exercise_id, sets, reps, rest_seconds, coach_notes, sort_order,
            exercise:exercises(id, name, muscle_groups, youtube_url, equipment))`)
        .eq('template_id', tplId)
        .order('sort_order'),
    ])
    if (tplRes.data) setWorkoutName(tplRes.data.name)
    if (daysRes.data && daysRes.data.length > 0) {
      setDays((daysRes.data as any[]).map(d => ({
        name: d.name,
        weekday_suggestion: d.weekday_suggestion || [],
        collapsed: false,
        cardio: [],
        exercises: (d.exercises as any[])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((ex: any) => ({
            exercise_id: ex.exercise_id,
            exercise: ex.exercise,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            coach_notes: ex.coach_notes || '',
            sort_order: ex.sort_order,
          })),
      })))
    }
  }

  const fetchStudent = async () => {
    const { data } = await supabase.from('students').select('user:users(name)').eq('id', studentId).single()
    setStudentName((data?.user as any)?.name || '')
  }
  const fetchExercises = async () => {
    const { data } = await supabase.from('exercises').select('*').eq('active', true).order('name')
    setAllExercises(data || [])
    setSearchResults((data || []).slice(0, 8))
  }

  const addDay = () => {
    const letters = 'ABCDEFGHIJKLMNOP'
    setDays(prev => [...prev, { name: letters[prev.length] || `${prev.length + 1}`, weekday_suggestion: [], exercises: [], cardio: [], collapsed: false }])
  }
  const removeDay = (i: number) => setDays(prev => prev.filter((_, idx) => idx !== i))
  const toggleDayCollapse = (i: number) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, collapsed: !d.collapsed } : d))
  const updateDayName = (i: number, name: string) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, name } : d))
  const toggleWeekday = (dayIdx: number, wd: number) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, weekday_suggestion: d.weekday_suggestion.includes(wd) ? d.weekday_suggestion.filter(x => x !== wd) : [...d.weekday_suggestion, wd] }))

  const addExercise = (dayIdx: number, exercise: Exercise) => {
    setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: [...d.exercises, { exercise_id: exercise.id, exercise, sets: 3, reps: '10-12', rest_seconds: 60, coach_notes: '', sort_order: d.exercises.length }] }))
    setActivePickerDay(null); setExerciseSearch('')
  }
  const removeExercise = (dayIdx: number, exIdx: number) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.filter((_, j) => j !== exIdx) }))
  const updateExField = (dayIdx: number, exIdx: number, field: keyof WorkoutExercise, value: any) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.map((ex, j) => j !== exIdx ? ex : { ...ex, [field]: value }) }))

  const addCardio = (dayIdx: number) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, cardio: [...d.cardio, emptyCardio(d.cardio.length)] }))
  const removeCardio = (dayIdx: number, ci: number) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, cardio: d.cardio.filter((_, j) => j !== ci) }))
  const updateCardioField = (dayIdx: number, ci: number, field: keyof CardioItem, value: any) => setDays(prev => prev.map((d, i) => i !== dayIdx ? d : { ...d, cardio: d.cardio.map((c, j) => j !== ci ? c : { ...c, [field]: value }) }))

  const handleSave = async () => {
    if (!workoutName.trim() || !validFrom || !validTo) { alert('Preencha nome, data de início e data de fim.'); return }
    if (days.some(d => d.exercises.length === 0 && d.cardio.length === 0)) { alert('Todas as divisões precisam ter pelo menos 1 exercício ou 1 cárdio.'); return }
    setSaving(true)
    try {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()

      if (isEditing) {
        await supabase.from('workouts').update({ name: workoutName.trim(), periodization: periodization || null, valid_from: validFrom, valid_to: validTo }).eq('id', workoutId!)

        const currentIds = days.filter(d => d.id).map(d => d.id!)
        const removedIds = originalDayIds.filter(id => !currentIds.includes(id))
        for (const dayId of removedIds) {
          await supabase.from('workout_exercises').delete().eq('workout_day_id', dayId)
          await supabase.from('workout_cardio').delete().eq('workout_day_id', dayId)
          const { count } = await supabase.from('training_sessions').select('id', { count: 'exact', head: true }).eq('workout_day_id', dayId)
          if (!count) await supabase.from('workout_days').delete().eq('id', dayId)
        }

        for (const [di, day] of days.entries()) {
          if (day.id) {
            await supabase.from('workout_days').update({ name: day.name, weekday_suggestion: day.weekday_suggestion, sort_order: di }).eq('id', day.id)
            await supabase.from('workout_exercises').delete().eq('workout_day_id', day.id)
            await supabase.from('workout_cardio').delete().eq('workout_day_id', day.id)
            if (day.exercises.length > 0)
              await supabase.from('workout_exercises').insert(day.exercises.map((ex, ei) => ({ workout_day_id: day.id!, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, coach_notes: ex.coach_notes || null, sort_order: ei })))
            if (day.cardio.length > 0)
              await supabase.from('workout_cardio').insert(day.cardio.map((c, ci) => ({ workout_day_id: day.id!, modality: c.modality, duration_min: c.duration_min, intensity: c.intensity, distance_km: c.distance_km ? parseFloat(c.distance_km) : null, notes: c.notes || null, sort_order: ci })))
          } else {
            const { data: wd } = await supabase.from('workout_days').insert({ workout_id: workoutId!, name: day.name, weekday_suggestion: day.weekday_suggestion, sort_order: di }).select().single()
            if (day.exercises.length > 0)
              await supabase.from('workout_exercises').insert(day.exercises.map((ex, ei) => ({ workout_day_id: wd!.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, coach_notes: ex.coach_notes || null, sort_order: ei })))
            if (day.cardio.length > 0)
              await supabase.from('workout_cardio').insert(day.cardio.map((c, ci) => ({ workout_day_id: wd!.id, modality: c.modality, duration_min: c.duration_min, intensity: c.intensity, distance_km: c.distance_km ? parseFloat(c.distance_km) : null, notes: c.notes || null, sort_order: ci })))
          }
        }
        await supabase.from('activity_logs').insert({ coach_id: coach!.id, action_type: 'updated_workout', target_student_id: studentId, details: { workout_name: workoutName } })
      } else {
        await supabase.from('workouts').update({ active: false }).eq('student_id', studentId).eq('active', true)
        const { data: workout } = await supabase.from('workouts').insert({ student_id: studentId, coach_id: coach!.id, name: workoutName.trim(), periodization: periodization || null, valid_from: validFrom, valid_to: validTo, active: true }).select().single()
        for (const [di, day] of days.entries()) {
          const { data: wd } = await supabase.from('workout_days').insert({ workout_id: workout!.id, name: day.name, weekday_suggestion: day.weekday_suggestion, sort_order: di }).select().single()
          if (day.exercises.length > 0)
            await supabase.from('workout_exercises').insert(day.exercises.map((ex, ei) => ({ workout_day_id: wd!.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, coach_notes: ex.coach_notes || null, sort_order: ei })))
          if (day.cardio.length > 0)
            await supabase.from('workout_cardio').insert(day.cardio.map((c, ci) => ({ workout_day_id: wd!.id, modality: c.modality, duration_min: c.duration_min, intensity: c.intensity, distance_km: c.distance_km ? parseFloat(c.distance_km) : null, notes: c.notes || null, sort_order: ci })))
        }
        await supabase.from('activity_logs').insert({ coach_id: coach!.id, action_type: 'created_workout', target_student_id: studentId, details: { workout_name: workoutName } })
        await sendPushToStudent(studentId!, '💪 Novo treino disponível!', `Seu coach cadastrou um novo treino: ${workoutName.trim()}`, '/(student)/workout')
        sendAutoMessage({ coachUserId: user!.id, coachId: coach!.id, studentId: studentId!, type: 'workout_assigned', studentName })
      }

      navigate(`/coach/students/${studentId}/workouts`)
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 760 }}>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{isEditing ? 'Editar treino de' : 'Novo treino para'}</p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
          {templateId && !isEditing && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 20 }}>
              <LayoutList size={12} color="#E8FF00" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#E8FF00' }}>A partir de template — ajuste à vontade</span>
            </div>
          )}
        </div>

        {/* Info geral */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Nome do Treino *</label>
            <input type="text" value={workoutName} onChange={e => setWorkoutName(e.target.value)} placeholder="Ex: Treino ABC — Hipertrofia" style={inp()}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={lbl}>Tipo de Periodização</label>
            <select value={periodization} onChange={e => setPeriodization(e.target.value)}
              style={{ ...inp(), colorScheme: 'dark' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <option value="">Selecionar…</option>
              <option value="linear">Periodização Linear</option>
              <option value="daily_undulating">Periodização Ondulatória Diária</option>
              <option value="block">Periodização em Blocos</option>
              <option value="weekly_undulating">Periodização Ondulatória Semanal</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Início *</label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={{ ...inp(), colorScheme: 'dark' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Fim *</label>
              <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} style={{ ...inp(), colorScheme: 'dark' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            </div>
          </div>
        </div>

        {/* Divisões */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {days.map((day, di) => (
            <div key={di} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Header da divisão */}
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
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{day.exercises.length} ex.</span>
                  {day.cardio.length > 0 && (
                    <span style={{ fontSize: 12, color: '#4FC3F7', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Timer size={12} /> {day.cardio.length}
                    </span>
                  )}
                </div>
                <button onClick={() => toggleDayCollapse(di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                  <ChevronDown size={18} style={{ transform: day.collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
                </button>
                {days.length > 1 && (
                  <button onClick={() => removeDay(di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {!day.collapsed && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* ── Exercícios de musculação ── */}
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
                            onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Séries</label>
                          <input type="number" value={ex.sets} onChange={e => updateExField(di, ei, 'sets', parseInt(e.target.value) || 1)}
                            style={{ width: 64, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Reps / Tempo</label>
                          <input type="text" value={ex.reps} onChange={e => updateExField(di, ei, 'reps', e.target.value)} placeholder="10-12"
                            style={{ width: 90, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 10 }}>Descanso (s)</label>
                          <input type="number" value={ex.rest_seconds} onChange={e => updateExField(di, ei, 'rest_seconds', parseInt(e.target.value) || 30)}
                            style={{ width: 80, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <label style={{ ...lbl, fontSize: 10 }}>Observação do coach</label>
                          <input type="text" value={ex.coach_notes} onChange={e => updateExField(di, ei, 'coach_notes', e.target.value)} placeholder="Dicas, cuidados..."
                            style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Picker de exercício */}
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

                  {/* ── Cárdio ── */}
                  {(day.cardio.length > 0 || true) && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Timer size={12} color="#4FC3F7" />
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#4FC3F7', textTransform: 'uppercase', letterSpacing: 1 }}>Cárdio</span>
                        </div>
                        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
                      </div>

                      {day.cardio.map((c, ci) => (
                        <div key={ci} style={{ backgroundColor: 'var(--bg)', border: '1px solid rgba(79,195,247,0.2)', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Timer size={14} color="#4FC3F7" />
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#4FC3F7' }}>Cárdio {ci + 1}</span>
                            </div>
                            <button onClick={() => removeCardio(di, ci)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 130 }}>
                              <label style={{ ...lbl, fontSize: 10 }}>Modalidade</label>
                              <select value={c.modality} onChange={e => updateCardioField(di, ci, 'modality', e.target.value)}
                                style={{ padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                                {CARDIO_MODALITIES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ ...lbl, fontSize: 10 }}>Duração (min)</label>
                              <input type="number" value={c.duration_min} min={1} max={300}
                                onChange={e => updateCardioField(di, ci, 'duration_min', parseInt(e.target.value) || 1)}
                                style={{ width: 80, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#4FC3F7')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                            </div>
                            <div>
                              <label style={{ ...lbl, fontSize: 10 }}>Intensidade</label>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {CARDIO_INTENSITY.map(opt => (
                                  <button key={opt.value} onClick={() => updateCardioField(di, ci, 'intensity', opt.value)}
                                    style={{ padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', backgroundColor: c.intensity === opt.value ? intensityColor(opt.value) : 'var(--surface)', color: c.intensity === opt.value ? '#0A0A0A' : 'var(--text-2)', transition: 'all 0.1s' }}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label style={{ ...lbl, fontSize: 10 }}>Distância (km)</label>
                              <input type="number" value={c.distance_km} min={0} step={0.1} placeholder="—"
                                onChange={e => updateCardioField(di, ci, 'distance_km', e.target.value)}
                                style={{ width: 80, padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, textAlign: 'center', outline: 'none' }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#4FC3F7')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                            </div>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <label style={{ ...lbl, fontSize: 10 }}>Observação</label>
                              <input type="text" value={c.notes} onChange={e => updateCardioField(di, ci, 'notes', e.target.value)} placeholder="Ex: esteira a 10km/h"
                                style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#4FC3F7')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                            </div>
                          </div>
                        </div>
                      ))}

                      <DashedBtn onClick={() => addCardio(di)} accent="#4FC3F7">
                        <Timer size={15} /> Adicionar cárdio
                      </DashedBtn>
                    </div>
                  )}

                </div>
              )}
            </div>
          ))}

          <DashedBtn onClick={addDay}><Plus size={15} /> Adicionar divisão</DashedBtn>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <OutlineBtn onClick={() => navigate(-1)}>Cancelar</OutlineBtn>
          <SaveBtn onClick={handleSave} saving={saving}>{isEditing ? 'Salvar Alterações' : 'Salvar Treino'}</SaveBtn>
        </div>
      </div>
    </div>
  )
}

function intensityColor(intensity: string) {
  if (intensity === 'leve') return '#66BB6A'
  if (intensity === 'moderada') return '#FFA726'
  return '#EF5350'
}

function DashedBtn({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: string }) {
  const [hovered, setHovered] = useState(false)
  const color = accent || '#E8FF00'
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', padding: '12px 0', border: `1px dashed ${hovered ? color : '#3A3A3A'}`, borderRadius: 12, backgroundColor: 'transparent', color: hovered ? color : '#888', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.15s' }}>
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
