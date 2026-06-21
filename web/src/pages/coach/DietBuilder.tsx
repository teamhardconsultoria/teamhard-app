import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, X, Search, GripVertical, Sparkles, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { sendPushToStudent } from '../../lib/push'
import { sendAutoMessage } from '../../lib/autoMessage'

interface TacoFood { id: string; nome: string; kcal_100g: number; proteina_g: number; gordura_g: number; carboidrato_g: number }
interface Food { name: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number; taco: TacoFood | null }
interface Meal { id?: string; name: string; suggested_time: string; foods: Food[]; collapsed: boolean }
interface DietDay { id?: string; label: string; weekday: number[]; meals: Meal[]; calorie_goal: number; collapsed: boolean }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const UNITS = ['g', 'ml', 'unidade', 'colher', 'xícara', 'fatia', 'porção']

const emptyFood = (): Food => ({ name: '', quantity: 100, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, taco: null })
const emptyMeal = (): Meal => ({ name: '', suggested_time: '', foods: [emptyFood()], collapsed: false })
const emptyDay = (): DietDay => ({ label: 'Dia de Treino', weekday: [], meals: [emptyMeal()], calorie_goal: 0, collapsed: false })
const round1 = (n: number) => Math.round(n * 10) / 10
const calcMacros = (taco: TacoFood, qty: number) => ({ calories: round1(taco.kcal_100g * qty / 100), protein: round1(taco.proteina_g * qty / 100), carbs: round1(taco.carboidrato_g * qty / 100), fat: round1(taco.gordura_g * qty / 100) })
const calcMealTotals = (foods: Food[]) => ({ cal: foods.reduce((s, f) => s + (f.calories || 0), 0), prot: foods.reduce((s, f) => s + (f.protein || 0), 0), carbs: foods.reduce((s, f) => s + (f.carbs || 0), 0), fat: foods.reduce((s, f) => s + (f.fat || 0), 0) })
const calcDayTotals = (meals: Meal[]) => calcMealTotals(meals.flatMap(m => m.foods))

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, width: '100%', ...extra })

export default function DietBuilder() {
  const { id: studentId, dietId } = useParams()
  const isEditing = !!dietId
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [studentName, setStudentName] = useState('')
  const [dietName, setDietName] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0])
  const [validTo, setValidTo] = useState('')
  const [days, setDays] = useState<DietDay[]>([emptyDay()])
  const [originalDayIds, setOriginalDayIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [draggingMeal, setDraggingMeal] = useState<{ di: number; mi: number } | null>(null)
  const [dragOverMeal, setDragOverMeal] = useState<{ di: number; mi: number } | null>(null)
  const dragMealSrc = useRef<{ di: number; mi: number } | null>(null)
  const dragMealAllowed = useRef(false)

  const [aiStep, setAiStep] = useState<'idle'|'params'|'loading'|'result'>('idle')
  const [aiGoalMode, setAiGoalMode] = useState<'emagrecer'|'ganhar_massa'|'recomposicao'>('emagrecer')
  const [aiActivityFactor, setAiActivityFactor] = useState(1.375)
  const [aiResult, setAiResult] = useState<any>(null)
  const [aiError, setAiError] = useState('')

  const moveMeal = (di: number, from: number, to: number) => {
    if (from === to) return
    setDays(prev => prev.map((d, i) => {
      if (i !== di) return d
      const meals = [...d.meals]
      const [moved] = meals.splice(from, 1)
      meals.splice(to, 0, moved)
      return { ...d, meals }
    }))
  }

  useEffect(() => { fetchStudent(); if (isEditing) fetchDiet() }, [studentId])

  const fetchStudent = async () => {
    const { data } = await supabase.from('students').select('user:users(name), anamnese(get_value)').eq('id', studentId).single()
    setStudentName((data?.user as any)?.name || '')
    const getVal = (data?.anamnese as any)?.get_value
    if (getVal) setDays(prev => prev.map(d => ({ ...d, calorie_goal: Math.round(getVal) })))
  }

  const fetchDiet = async () => {
    const { data: d } = await supabase.from('diets').select('id, name, valid_from, valid_to').eq('id', dietId!).single()
    if (!d) return
    setDietName(d.name)
    setValidFrom(d.valid_from)
    setValidTo(d.valid_to)
    const { data: dbDays } = await supabase.from('diet_days').select('id, label, weekday, sort_order, calorie_goal').eq('diet_id', dietId!).order('sort_order')
    const loadedDays: DietDay[] = await Promise.all((dbDays || []).map(async (day) => {
      const { data: dbMeals } = await supabase.from('meals').select('id, name, suggested_time, sort_order').eq('diet_day_id', day.id).order('sort_order')
      const meals: Meal[] = await Promise.all((dbMeals || []).map(async (meal) => {
        const { data: dbFoods } = await supabase.from('meal_foods').select('id, name, quantity, unit, calories, protein, carbs, fat').eq('meal_id', meal.id).order('sort_order')
        const foods: Food[] = (dbFoods || []).map(f => ({ name: f.name, quantity: f.quantity, unit: f.unit, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, taco: null }))
        return { id: meal.id, name: meal.name, suggested_time: meal.suggested_time || '', foods: foods.length > 0 ? foods : [emptyFood()], collapsed: false }
      }))
      return { id: day.id, label: day.label, weekday: day.weekday || [], meals: meals.length > 0 ? meals : [emptyMeal()], calorie_goal: day.calorie_goal || 0, collapsed: false }
    }))
    setDays(loadedDays.length > 0 ? loadedDays : [emptyDay()])
    setOriginalDayIds((dbDays || []).map(d => d.id))
  }

  const addDay = () => setDays(prev => [...prev, emptyDay()])
  const removeDay = (i: number) => setDays(prev => prev.filter((_, idx) => idx !== i))
  const updateDay = (i: number, field: keyof DietDay, value: any) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  const toggleWeekday = (di: number, wd: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, weekday: d.weekday.includes(wd) ? d.weekday.filter(x => x !== wd) : [...d.weekday, wd] }))

  const addMeal = (di: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: [...d.meals, emptyMeal()] }))
  const removeMeal = (di: number, mi: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: d.meals.filter((_, j) => j !== mi) }))
  const updateMeal = (di: number, mi: number, field: keyof Meal, value: any) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: d.meals.map((m, j) => j !== mi ? m : { ...m, [field]: value }) }))

  const addFood = (di: number, mi: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: d.meals.map((m, j) => j !== mi ? m : { ...m, foods: [...m.foods, emptyFood()] }) }))
  const removeFood = (di: number, mi: number, fi: number) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: d.meals.map((m, j) => j !== mi ? m : { ...m, foods: m.foods.filter((_, k) => k !== fi) }) }))
  const patchFood = (di: number, mi: number, fi: number, patch: Partial<Food>) => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: d.meals.map((m, j) => j !== mi ? m : { ...m, foods: m.foods.map((f, k) => k !== fi ? f : { ...f, ...patch }) }) }))
  const selectTacoFood = (di: number, mi: number, fi: number, taco: TacoFood, qty: number) => patchFood(di, mi, fi, { name: taco.nome, unit: 'g', taco, ...calcMacros(taco, qty) })
  const handleQtyChange = (di: number, mi: number, fi: number, food: Food, qty: number) => patchFood(di, mi, fi, food.taco ? { quantity: qty, ...calcMacros(food.taco, qty) } : { quantity: qty })

  const generateWithAI = async () => {
    setAiStep('loading'); setAiError('')
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-plan', {
        body: { student_id: studentId, type: 'diet', goal_mode: aiGoalMode, activity_factor_override: aiActivityFactor },
      })
      if (error || data?.error) { setAiError(data?.error || error?.message || 'Erro'); setAiStep('params'); return }
      setAiResult(data.plan); setAiStep('result')
    } catch (e: any) { setAiError(e.message || 'Erro inesperado'); setAiStep('params') }
  }

  const applyAIDiet = (plan: any) => {
    setDietName(plan.diet_name || '')
    const today = new Date().toISOString().split('T')[0]
    setValidFrom(today)
    const end = new Date(); end.setMonth(end.getMonth() + 3)
    setValidTo(end.toISOString().split('T')[0])
    const newDays: DietDay[] = (plan.days || []).map((d: any) => ({
      label: d.label || 'Dia',
      weekday: [],
      calorie_goal: d.calorie_goal || 0,
      collapsed: false,
      meals: (d.meals || []).map((m: any) => ({
        name: m.name || '',
        suggested_time: m.suggested_time || '',
        collapsed: false,
        foods: (m.foods || []).map((f: any) => ({
          name: f.name || '', quantity: f.quantity || 100, unit: f.unit || 'g',
          calories: f.calories || 0, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0, taco: null,
        })),
      })),
    }))
    setDays(newDays)
    setAiStep('idle'); setAiResult(null)
  }

  const handleSave = async () => {
    if (!dietName.trim() || !validFrom || !validTo) { alert('Preencha nome, início e fim da dieta.'); return }
    setSaving(true)
    try {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()

      if (isEditing) {
        await supabase.from('diets').update({ name: dietName.trim(), valid_from: validFrom, valid_to: validTo }).eq('id', dietId!)

        const currentDayIds = days.filter(d => d.id).map(d => d.id!)
        const removedDayIds = originalDayIds.filter(id => !currentDayIds.includes(id))
        if (removedDayIds.length > 0) await supabase.from('diet_days').delete().in('id', removedDayIds)

        for (const [di, day] of days.entries()) {
          const dt = calcDayTotals(day.meals)
          let dayId = day.id
          if (dayId) {
            await supabase.from('diet_days').update({ label: day.label, weekday: day.weekday, sort_order: di, calorie_goal: day.calorie_goal || dt.cal, protein_goal: dt.prot, carbs_goal: dt.carbs, fat_goal: dt.fat }).eq('id', dayId)
            await supabase.from('meals').delete().eq('diet_day_id', dayId)
          } else {
            const { data: dd } = await supabase.from('diet_days').insert({ diet_id: dietId!, label: day.label, weekday: day.weekday, sort_order: di, calorie_goal: day.calorie_goal || dt.cal, protein_goal: dt.prot, carbs_goal: dt.carbs, fat_goal: dt.fat }).select().single()
            dayId = dd!.id
          }
          for (const [mi, meal] of day.meals.entries()) {
            const { data: m } = await supabase.from('meals').insert({ diet_day_id: dayId, name: meal.name || `Refeição ${mi + 1}`, suggested_time: meal.suggested_time || null, sort_order: mi }).select().single()
            const validFoods = meal.foods.filter(f => f.name.trim())
            if (validFoods.length > 0) await supabase.from('meal_foods').insert(validFoods.map((f, fi) => ({ meal_id: m!.id, name: f.name.trim(), quantity: f.quantity || 0, unit: f.unit, calories: f.calories || 0, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0, sort_order: fi })))
          }
        }
        await supabase.from('activity_logs').insert({ coach_id: coach!.id, action_type: 'updated_diet', target_student_id: studentId, details: { diet_name: dietName } })
        navigate(`/coach/students/${studentId}/diets`)
      } else {
        await supabase.from('diets').update({ active: false }).eq('student_id', studentId).eq('active', true)
        const { data: diet } = await supabase.from('diets').insert({ student_id: studentId, coach_id: coach!.id, name: dietName.trim(), valid_from: validFrom, valid_to: validTo, active: true }).select().single()
        for (const [di, day] of days.entries()) {
          const dt = calcDayTotals(day.meals)
          const { data: dd } = await supabase.from('diet_days').insert({ diet_id: diet!.id, label: day.label, weekday: day.weekday, sort_order: di, calorie_goal: day.calorie_goal || dt.cal, protein_goal: dt.prot, carbs_goal: dt.carbs, fat_goal: dt.fat }).select().single()
          for (const [mi, meal] of day.meals.entries()) {
            const { data: m } = await supabase.from('meals').insert({ diet_day_id: dd!.id, name: meal.name || `Refeição ${mi + 1}`, suggested_time: meal.suggested_time || null, sort_order: mi }).select().single()
            const validFoods = meal.foods.filter(f => f.name.trim())
            if (validFoods.length > 0) await supabase.from('meal_foods').insert(validFoods.map((f, fi) => ({ meal_id: m!.id, name: f.name.trim(), quantity: f.quantity || 0, unit: f.unit, calories: f.calories || 0, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0, sort_order: fi })))
          }
        }
        await supabase.from('activity_logs').insert({ coach_id: coach!.id, action_type: 'created_diet', target_student_id: studentId, details: { diet_name: dietName } })
        await sendPushToStudent(studentId!, '🥗 Nova dieta disponível!', `Seu coach cadastrou uma nova dieta: ${dietName.trim()}`, '/(student)/diet')
        sendAutoMessage({ coachUserId: user!.id, coachId: coach!.id, studentId: studentId!, type: 'diet_assigned', studentName })
        navigate(`/coach/students/${studentId}/diets`)
      }
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 900 }}>

        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{isEditing ? 'Editar dieta de' : 'Nova dieta para'}</p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
          </div>
          <button onClick={() => { setAiStep('params'); setAiError('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.3)', borderRadius: 12, color: '#E8FF00', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginTop: 6 }}>
            <Sparkles size={15} /> Gerar com IA
          </button>
        </div>

        {/* Info geral */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Nome da Dieta *</label>
            <input type="text" value={dietName} onChange={e => setDietName(e.target.value)} placeholder="Ex: Dieta de Emagrecimento — Junho" style={inp()}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
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

        {/* Dias */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {days.map((day, di) => {
            const totals = calcDayTotals(day.meals)
            return (
              <div key={di} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Header do dia */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <input type="text" value={day.label} onChange={e => updateDay(di, 'label', e.target.value)}
                    style={{ fontWeight: 700, color: 'var(--text)', backgroundColor: 'transparent', border: 'none', outline: 'none', flex: 1, fontSize: 14, minWidth: 120 }}
                    placeholder="Nome do dia" />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {WEEKDAYS.map((wd, wdi) => (
                      <button key={wdi} onClick={() => toggleWeekday(di, wdi)}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', border: 'none', backgroundColor: day.weekday.includes(wdi) ? '#E8FF00' : '#1E1E1E', color: day.weekday.includes(wdi) ? '#0A0A0A' : '#888' }}>
                        {wd}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{Math.round(totals.cal)} kcal</span>
                  <button onClick={() => updateDay(di, 'collapsed', !day.collapsed)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
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
                    {/* Meta calórica */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
                      <span>Meta calórica:</span>
                      <input type="number" value={day.calorie_goal || ''} placeholder="Auto"
                        onChange={e => updateDay(di, 'calorie_goal', parseInt(e.target.value) || 0)}
                        style={{ width: 80, padding: '4px 8px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, textAlign: 'center', outline: 'none' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                      <span>kcal | P: {Math.round(totals.prot)}g · C: {Math.round(totals.carbs)}g · G: {Math.round(totals.fat)}g</span>
                    </div>

                    {/* Refeições */}
                    {day.meals.map((meal, mi) => {
                      const mealTotals = calcMealTotals(meal.foods)
                      const isDraggingThis = draggingMeal?.di === di && draggingMeal?.mi === mi
                      const isDragOver = dragOverMeal?.di === di && dragOverMeal?.mi === mi
                      return (
                        <div key={mi}
                          draggable
                          onDragStart={e => {
                            if (!dragMealAllowed.current) { e.preventDefault(); return }
                            dragMealAllowed.current = false
                            dragMealSrc.current = { di, mi }
                            setDraggingMeal({ di, mi })
                          }}
                          onDragEnd={() => { setDraggingMeal(null); setDragOverMeal(null); dragMealSrc.current = null }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragMealSrc.current?.di === di && dragMealSrc.current?.mi !== mi) setDragOverMeal({ di, mi }) }}
                          onDragLeave={() => { if (dragOverMeal?.di === di && dragOverMeal?.mi === mi) setDragOverMeal(null) }}
                          onDrop={e => {
                            e.preventDefault()
                            if (dragMealSrc.current && dragMealSrc.current.di === di && dragMealSrc.current.mi !== mi) {
                              moveMeal(di, dragMealSrc.current.mi, mi)
                            }
                            setDraggingMeal(null); setDragOverMeal(null); dragMealSrc.current = null
                          }}
                          style={{ backgroundColor: 'var(--bg)', border: isDragOver ? '1px solid #E8FF00' : '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', opacity: isDraggingThis ? 0.45 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                            {day.meals.length > 1 && (
                              <span
                                onMouseDown={() => { dragMealAllowed.current = true }}
                                onMouseUp={() => { dragMealAllowed.current = false }}
                                style={{ color: '#888', cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', touchAction: 'none' }}>
                                <GripVertical size={14} />
                              </span>
                            )}
                            <input type="text" value={meal.name} placeholder="Nome da refeição (ex: Café da Manhã)"
                              onChange={e => updateMeal(di, mi, 'name', e.target.value)}
                              style={{ flex: 1, background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, border: 'none', outline: 'none' }} />
                            <input type="time" value={meal.suggested_time} onChange={e => updateMeal(di, mi, 'suggested_time', e.target.value)}
                              style={{ background: 'transparent', color: 'var(--text-2)', fontSize: 12, border: 'none', outline: 'none', colorScheme: 'dark' }} />
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{Math.round(mealTotals.cal)} kcal</span>
                            <button onClick={() => updateMeal(di, mi, 'collapsed', !meal.collapsed)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}>
                              <ChevronDown size={16} style={{ transform: meal.collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
                            </button>
                            {day.meals.length > 1 && (
                              <button onClick={() => removeMeal(di, mi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                                <X size={15} />
                              </button>
                            )}
                          </div>

                          {!meal.collapsed && (
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', fontSize: 10, color: 'var(--text-3)', padding: '0 4px 6px 0', fontWeight: 400 }}>Alimento</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 68, fontWeight: 400 }}>Qtd</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 68, fontWeight: 400 }}>Unid.</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 65, fontWeight: 400 }}>Kcal</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 58, fontWeight: 400 }}>Prot.</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 58, fontWeight: 400 }}>Carb.</th>
                                    <th style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', padding: '0 2px 6px', width: 58, fontWeight: 400 }}>Gord.</th>
                                    <th style={{ width: 28 }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {meal.foods.map((food, fi) => (
                                    <FoodRow key={fi} food={food}
                                      onUpdate={patch => patchFood(di, mi, fi, patch)}
                                      onRemove={() => removeFood(di, mi, fi)}
                                      onSelectTaco={taco => selectTacoFood(di, mi, fi, taco, food.quantity)}
                                      onQuantityChange={qty => handleQtyChange(di, mi, fi, food, qty)}
                                      onClearTaco={() => patchFood(di, mi, fi, { taco: null })}
                                      showRemove={meal.foods.length > 1} />
                                  ))}
                                </tbody>
                              </table>

                              <button onClick={() => addFood(di, mi)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: 'fit-content' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#E8FF00')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                                <Plus size={12} /> Adicionar alimento
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    <DashedBtn onClick={() => addMeal(di)}><Plus size={14} /> Adicionar refeição</DashedBtn>
                  </div>
                )}
              </div>
            )
          })}

          <DashedBtn onClick={addDay}><Plus size={15} /> Adicionar dia (ex: Dia de Descanso)</DashedBtn>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <OutlineBtn onClick={() => navigate(-1)}>Cancelar</OutlineBtn>
          <SaveBtn onClick={handleSave} saving={saving}>{isEditing ? 'Salvar Alterações' : 'Salvar Dieta'}</SaveBtn>
        </div>
      </div>

      {/* ── Modal IA ─────────────────────────────────────────────────────── */}
      {aiStep !== 'idle' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>

          {/* Params */}
          {aiStep === 'params' && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="#E8FF00" />
                  <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Gerar Dieta com IA</h2>
                </div>
                <button onClick={() => setAiStep('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}><X size={20} /></button>
              </div>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>A IA vai analisar anamnese, avaliação física e fotos para gerar um plano alimentar personalizado.</p>
                <div>
                  <label style={lbl}>Objetivo da dieta</label>
                  <select value={aiGoalMode} onChange={e => setAiGoalMode(e.target.value as any)} style={{ ...inp(), colorScheme: 'dark' }}>
                    <option value="emagrecer">Emagrecimento (déficit calórico)</option>
                    <option value="ganhar_massa">Ganho de Massa (superávit)</option>
                    <option value="recomposicao">Recomposição Corporal (manutenção)</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Fator de atividade para GET</label>
                  <select value={aiActivityFactor} onChange={e => setAiActivityFactor(parseFloat(e.target.value))} style={{ ...inp(), colorScheme: 'dark' }}>
                    <option value={1.2}>Sedentário (1,20) — sem exercício</option>
                    <option value={1.375}>Levemente ativo (1,375) — 1–3×/semana</option>
                    <option value={1.55}>Moderadamente ativo (1,55) — 3–5×/semana</option>
                    <option value={1.725}>Muito ativo (1,725) — 6–7×/semana</option>
                    <option value={1.9}>Extremamente ativo (1,90) — atleta</option>
                  </select>
                </div>
                {aiError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{aiError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setAiStep('idle')} style={{ flex: 1, padding: '11px 0', border: '1px solid var(--border)', borderRadius: 12, background: 'none', color: 'var(--text-2)', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={generateWithAI} style={{ flex: 2, padding: '11px 0', backgroundColor: '#E8FF00', border: 'none', borderRadius: 12, color: '#0A0A0A', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Sparkles size={15} /> Gerar Dieta
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {aiStep === 'loading' && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 40, height: 40, border: '3px solid rgba(232,255,0,0.15)', borderTopColor: '#E8FF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text)', fontWeight: 700, margin: 0 }}>Gerando dieta…</p>
                <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '4px 0 0 0' }}>Analisando perfil e fotos — pode levar 20–40 s</p>
              </div>
            </div>
          )}

          {/* Result */}
          {aiStep === 'result' && aiResult && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="#E8FF00" />
                  <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Dieta Gerada por IA</h2>
                </div>
                <button onClick={() => { setAiStep('idle'); setAiResult(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}><X size={20} /></button>
              </div>

              <div style={{ overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                {aiResult.needs_info && (
                  <div style={{ backgroundColor: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.3)', borderRadius: 12, padding: '12px 16px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#FFA500', margin: '0 0 4px 0' }}>⚠ IA precisa de informação adicional:</p>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{aiResult.needs_info}</p>
                  </div>
                )}

                {aiResult.visual_bf_estimate && (
                  <div style={{ backgroundColor: 'rgba(232,255,0,0.04)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#E8FF00', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px 0' }}>Estimativa Visual por IA (aproximada)</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px 0' }}>~{aiResult.visual_bf_estimate.pct}% gordura corporal</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 6px 0' }}>Confiança: {aiResult.visual_bf_estimate.confidence} · {aiResult.visual_bf_estimate.note}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>⚠ Não é medição precisa — margem de erro ±5–10 p.p. Confirme com o coach antes de usar nos cálculos.</p>
                  </div>
                )}

                {/* Energy summary */}
                <div style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px 0' }}>Cálculo Energético</p>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[
                      { label: 'TMB', value: `${aiResult.tmb} kcal` },
                      { label: 'GET', value: `${aiResult.get} kcal` },
                      { label: 'Meta calórica', value: `${aiResult.calorie_target} kcal`, accent: true },
                      { label: 'Hidratação', value: `${(aiResult.hydration_ml / 1000).toFixed(1)} L/dia` },
                    ].map(item => (
                      <div key={item.label}>
                        <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 2px 0' }}>{item.label}</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: item.accent ? '#E8FF00' : 'var(--text)', margin: 0 }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {aiResult.macros_summary && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'Proteína', value: `${aiResult.macros_summary.protein_g}g`, color: '#64B5F6' },
                        { label: 'Carboidrato', value: `${aiResult.macros_summary.carbs_g}g`, color: '#FFB74D' },
                        { label: 'Gordura', value: `${aiResult.macros_summary.fat_g}g`, color: '#EF9A9A' },
                      ].map(m => (
                        <div key={m.label} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 2px 0' }}>{m.label}</p>
                          <p style={{ fontSize: 14, fontWeight: 700, color: m.color, margin: 0 }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {aiResult.justification?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px 0' }}>Raciocínio da IA</p>
                    {(aiResult.justification as string[]).map((j, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                        <span style={{ color: '#E8FF00', flexShrink: 0 }}>•</span><span>{j}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Days preview */}
                {(aiResult.days || []).map((day: any, di: number) => (
                  <div key={di}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px 0' }}>
                      {day.label} — {day.calorie_goal} kcal
                    </p>
                    {(day.meals || []).map((meal: any, mi: number) => {
                      const mealCal = (meal.foods || []).reduce((s: number, f: any) => s + (f.calories || 0), 0)
                      const mealProt = (meal.foods || []).reduce((s: number, f: any) => s + (f.protein || 0), 0)
                      return (
                        <div key={mi} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{meal.name} {meal.suggested_time && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>· {meal.suggested_time}</span>}</p>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{Math.round(mealCal)} kcal · P: {Math.round(mealProt)}g</span>
                          </div>
                          {(meal.foods || []).map((f: any, fi: number) => (
                            <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', marginBottom: 2 }}>
                              <span style={{ color: 'var(--text)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <span style={{ flexShrink: 0 }}>{f.quantity}{f.unit}</span>
                              <span style={{ flexShrink: 0, color: 'var(--text-3)' }}>{Math.round(f.calories)} kcal</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}

                {aiResult.substitutions && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px 0' }}>Substituições</p>
                    <div style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {aiResult.substitutions}
                    </div>
                  </div>
                )}

                {aiResult.supplementation_note && (
                  <div style={{ backgroundColor: 'rgba(100,181,246,0.06)', border: '1px solid rgba(100,181,246,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#64B5F6', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px 0' }}>Suplementação</p>
                    <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{aiResult.supplementation_note}</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button onClick={() => { setAiStep('idle'); setAiResult(null) }}
                  style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', borderRadius: 12, background: 'none', color: 'var(--text-2)', fontSize: 14, cursor: 'pointer' }}>
                  Descartar
                </button>
                <button onClick={() => applyAIDiet(aiResult)}
                  style={{ flex: 2, padding: '12px 0', backgroundColor: '#E8FF00', border: 'none', borderRadius: 12, color: '#0A0A0A', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Save size={15} /> Aplicar ao Builder
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FoodRow({ food, onUpdate, onRemove, onSelectTaco, onQuantityChange, onClearTaco, showRemove }: {
  food: Food; onUpdate: (patch: Partial<Food>) => void; onRemove: () => void
  onSelectTaco: (taco: TacoFood) => void; onQuantityChange: (qty: number) => void
  onClearTaco: () => void; showRemove: boolean
}) {
  const [results, setResults] = useState<TacoFood[]>([])
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const wrapRef = useRef<HTMLDivElement>(null)

  const updatePos = () => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 320) })
    }
  }

  const search = (q: string) => {
    onUpdate({ name: q })
    if (q.length < 2) { setResults([]); setOpen(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('alimentos').select('id, nome, kcal_100g, proteina_g, gordura_g, carboidrato_g').ilike('nome', `%${q}%`).limit(8)
      setResults(data || [])
      if ((data?.length ?? 0) > 0) { updatePos(); setOpen(true) } else setOpen(false)
    }, 250)
  }

  const select = (taco: TacoFood) => { onSelectTaco(taco); setResults([]); setOpen(false) }

  const cellInp: React.CSSProperties = { padding: '5px 4px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, textAlign: 'center', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const tacoInp: React.CSSProperties = { ...cellInp, backgroundColor: 'rgba(232,255,0,0.05)', border: '1px solid rgba(232,255,0,0.2)', color: 'var(--accent-text)', cursor: 'default' }
  const td: React.CSSProperties = { padding: '2px 2px', verticalAlign: 'middle' }

  return (
    <tr>
      <td style={{ ...td, padding: '2px 4px 2px 0' }}>
        {food.taco ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', backgroundColor: 'var(--surface)', border: '1px solid rgba(232,255,0,0.25)', borderRadius: 6, minHeight: 30 }}>
            <span style={{ color: 'var(--text)', fontSize: 12, flex: 1, wordBreak: 'break-word' }}>{food.name}</span>
            <span style={{ fontSize: 8, fontWeight: 900, color: 'var(--accent-text)', backgroundColor: 'rgba(232,255,0,0.1)', padding: '1px 4px', borderRadius: 4, flexShrink: 0, letterSpacing: 0.5 }}>TACO</span>
            <button onMouseDown={onClearTaco} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            <div ref={wrapRef} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <Search size={10} color="#444" style={{ flexShrink: 0 }} />
              <input type="text" value={food.name} onChange={e => search(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Buscar TACO..." style={{ background: 'transparent', color: 'var(--text)', fontSize: 12, border: 'none', outline: 'none', flex: 1, minWidth: 0 }} />
            </div>
            {open && results.length > 0 && createPortal(
              <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, maxWidth: 480, zIndex: 9999, backgroundColor: '#1A1A1A', border: '1px solid #2E2E2E', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', maxHeight: 200, overflowY: 'auto' }}>
                {results.map(r => (
                  <button key={r.id} onMouseDown={() => select(r)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #222', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#252525')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <span style={{ color: 'var(--text)', fontSize: 13 }}>{r.nome}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.kcal_100g)} kcal/100g</span>
                  </button>
                ))}
              </div>,
              document.body
            )}
          </>
        )}
      </td>

      <td style={td}>
        <input type="number" value={food.quantity} onChange={e => onQuantityChange(parseFloat(e.target.value) || 0)} style={cellInp}
          onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      </td>

      <td style={td}>
        <select value={food.unit} onChange={e => onUpdate({ unit: e.target.value })} disabled={!!food.taco}
          style={{ ...cellInp, cursor: food.taco ? 'not-allowed' : 'default', opacity: food.taco ? 0.4 : 1 }}>
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>

      {(['calories', 'protein', 'carbs', 'fat'] as const).map(field => (
        <td key={field} style={td}>
          <input type="number" value={food[field]} readOnly={!!food.taco}
            onChange={e => {
              if (food.taco) return
              const val = parseFloat(e.target.value) || 0
              const patch: Partial<Food> = { [field]: val }
              if (field !== 'calories') {
                const prot  = field === 'protein' ? val : food.protein
                const carbs = field === 'carbs'   ? val : food.carbs
                const fat   = field === 'fat'     ? val : food.fat
                patch.calories = round1(prot * 4 + carbs * 4 + fat * 9)
              }
              onUpdate(patch)
            }}
            style={food.taco ? tacoInp : cellInp}
            onFocus={e => { if (!food.taco) e.currentTarget.style.borderColor = '#E8FF00' }}
            onBlur={e => { if (!food.taco) e.currentTarget.style.borderColor = 'var(--border)' }} />
        </td>
      ))}

      <td style={{ ...td, textAlign: 'center' }}>
        <button onClick={showRemove ? onRemove : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: showRemove ? 'pointer' : 'default', color: 'var(--text-2)', padding: 2, opacity: showRemove ? 1 : 0, pointerEvents: showRemove ? 'auto' : 'none' }}
          onMouseEnter={e => { if (showRemove) e.currentTarget.style.color = '#FF4444' }}
          onMouseLeave={e => { if (showRemove) e.currentTarget.style.color = '#888' }}>
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

function DashedBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', padding: '11px 0', border: `1px dashed ${hovered ? '#E8FF00' : '#3A3A3A'}`, borderRadius: 12, backgroundColor: 'transparent', color: hovered ? 'var(--text)' : '#888', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.15s' }}>
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
        : <>{children}</>}
    </button>
  )
}
