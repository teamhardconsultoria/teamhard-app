import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronDown, ToggleLeft, ToggleRight, Salad, Clock, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface MealFood { id: string; name: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number }
interface Meal { id: string; name: string; suggested_time?: string; sort_order: number; foods: MealFood[] }
interface DietDay { id: string; label: string; weekday: number[]; sort_order: number; calorie_goal?: number; protein_goal?: number; carbs_goal?: number; fat_goal?: number; meals: Meal[] }
interface Diet { id: string; name: string; valid_from: string; valid_to: string; active: boolean; created_at: string; days: DietDay[] }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const spin = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

function macroTotals(foods: MealFood[]) {
  return foods.reduce((acc, f) => ({ cal: acc.cal + f.calories, p: acc.p + f.protein, c: acc.c + f.carbs, f: acc.f + f.fat }), { cal: 0, p: 0, c: 0, f: 0 })
}
function dayTotals(meals: Meal[]) {
  return meals.reduce((acc, m) => { const t = macroTotals(m.foods); return { cal: acc.cal + t.cal, p: acc.p + t.p, c: acc.c + t.c, f: acc.f + t.f } }, { cal: 0, p: 0, c: 0, f: 0 })
}

export default function DietList() {
  const { id: studentId } = useParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [dietEnabled, setDietEnabled] = useState(true)
  const [diets, setDiets] = useState<Diet[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  useEffect(() => { fetchData() }, [studentId])

  const fetchData = async () => {
    const { data: student } = await supabase.from('students').select('diet_enabled, user:users(name)').eq('id', studentId).single()
    if (student) {
      setStudentName((student.user as any).name)
      setDietEnabled((student as any).diet_enabled ?? true)
    }

    const { data: dList } = await supabase.from('diets').select('id, name, valid_from, valid_to, active, created_at').eq('student_id', studentId).order('created_at', { ascending: false })
    if (!dList) { setLoading(false); return }

    const full: Diet[] = await Promise.all(dList.map(async (d) => {
      const { data: days } = await supabase.from('diet_days').select('id, label, weekday, sort_order, calorie_goal, protein_goal, carbs_goal, fat_goal').eq('diet_id', d.id).order('sort_order')
      const daysWithMeals: DietDay[] = await Promise.all((days || []).map(async (day) => {
        const { data: meals } = await supabase.from('meals').select('id, name, suggested_time, sort_order').eq('diet_day_id', day.id).order('sort_order')
        const mealsWithFoods: Meal[] = await Promise.all((meals || []).map(async (meal) => {
          const { data: foods } = await supabase.from('meal_foods').select('id, name, quantity, unit, calories, protein, carbs, fat').eq('meal_id', meal.id).order('sort_order')
          return { ...meal, foods: foods || [] }
        }))
        return { ...day, meals: mealsWithFoods }
      }))
      return { ...d, days: daysWithMeals }
    }))

    setDiets(full)
    if (full.length > 0) setExpanded({ [full[0].id]: true })
    setLoading(false)
  }

  const toggleActive = async (diet: Diet) => {
    await supabase.from('diets').update({ active: !diet.active }).eq('id', diet.id)
    setDiets(prev => prev.map(d => d.id === diet.id ? { ...d, active: !d.active } : d))
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  const formatTime = (t?: string) => t ? t.slice(0, 5) : null

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 760 }}>

        <button onClick={() => navigate(`/coach/students/${studentId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 28, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ArrowLeft size={15} /> Voltar para {studentName || 'Aluno'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dietEnabled ? 28 : 16 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Dietas de</p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
          </div>
          <button onClick={() => dietEnabled && navigate(`/coach/students/${studentId}/diet/new`)}
            disabled={!dietEnabled}
            title={!dietEnabled ? 'Dieta desativada para este aluno' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: dietEnabled ? '#E8FF00' : 'var(--border)', color: dietEnabled ? '#0A0A0A' : 'var(--text-2)', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: dietEnabled ? 'pointer' : 'not-allowed', opacity: dietEnabled ? 1 : 0.6 }}
            onMouseEnter={e => { if (dietEnabled) e.currentTarget.style.backgroundColor = '#d4e800' }}
            onMouseLeave={e => { if (dietEnabled) e.currentTarget.style.backgroundColor = '#E8FF00' }}>
            <Plus size={16} /> Nova Dieta
          </button>
        </div>

        {!dietEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 24 }}>
            <Salad size={15} color="#FF9800" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: '#FF9800', margin: 0 }}>A área de dieta está <strong>desativada</strong> para este aluno. Reative no perfil para criar novas dietas.</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div style={spin} /></div>
        ) : diets.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Salad size={22} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhuma dieta criada</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '6px 0 20px' }}>Crie a primeira dieta para este aluno.</p>
            <button onClick={() => dietEnabled && navigate(`/coach/students/${studentId}/diet/new`)}
              disabled={!dietEnabled}
              title={!dietEnabled ? 'Dieta desativada para este aluno' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: dietEnabled ? '#E8FF00' : 'var(--border)', color: dietEnabled ? '#0A0A0A' : 'var(--text-2)', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: dietEnabled ? 'pointer' : 'not-allowed', opacity: dietEnabled ? 1 : 0.6 }}>
              <Plus size={16} /> Criar Dieta
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {diets.map(diet => {
              const isExpanded = !!expanded[diet.id]
              return (
                <div key={diet.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', opacity: diet.active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 12 }}>
                    <button onClick={() => setExpanded(p => ({ ...p, [diet.id]: !p[diet.id] }))}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{diet.name}</p>
                          {diet.active && <span style={{ fontSize: 10, fontWeight: 900, color: '#00C853', backgroundColor: 'rgba(0,200,83,0.1)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>ATIVA</span>}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>
                          {formatDate(diet.valid_from)} → {formatDate(diet.valid_to)} · {diet.days.length} dia{diet.days.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronDown size={16} color="#888" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                    </button>
                    <button onClick={() => navigate(`/coach/students/${studentId}/diet/${diet.id}/edit`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '5px 8px', borderRadius: 8, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
                      <Pencil size={15} /> Editar
                    </button>
                    <button onClick={() => toggleActive(diet)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: diet.active ? '#E8FF00' : '#888', padding: '5px 8px', borderRadius: 8, flexShrink: 0 }}>
                      {diet.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {diet.active ? 'Ativa' : 'Inativa'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {diet.days.map((day, dayIdx) => {
                        const totals = dayTotals(day.meals)
                        const isDayExpanded = !!expandedDays[day.id]
                        return (
                          <div key={day.id} style={{ borderBottom: dayIdx < diet.days.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <button onClick={() => setExpandedDays(p => ({ ...p, [day.id]: !p[day.id] }))}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: 'var(--bg)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d0d0d')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0A0A0A')}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>{day.label.charAt(0)}</span>
                                <div>
                                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{day.label}</p>
                                  {day.weekday.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '1px 0 0 0' }}>{day.weekday.map(d => WEEKDAYS[d]).join(', ')}</p>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.round(totals.cal)} kcal</span>
                                  <span style={{ color: 'var(--text-2)' }}>P {Math.round(totals.p)}g</span>
                                  <span style={{ color: 'var(--text-2)' }}>C {Math.round(totals.c)}g</span>
                                  <span style={{ color: 'var(--text-2)' }}>G {Math.round(totals.f)}g</span>
                                </div>
                                <ChevronDown size={14} color="#888" style={{ transform: isDayExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                              </div>
                            </button>

                            {isDayExpanded && (
                              <div>
                                {day.meals.map(meal => {
                                  const mt = macroTotals(meal.foods)
                                  return (
                                    <div key={meal.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{meal.name}</p>
                                          {meal.suggested_time && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                                              <Clock size={10} />{formatTime(meal.suggested_time)}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{Math.round(mt.cal)} kcal</span>
                                          <span style={{ color: 'var(--text-2)' }}>P {Math.round(mt.p)}g · C {Math.round(mt.c)}g · G {Math.round(mt.f)}g</span>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {meal.foods.map(food => (
                                          <div key={food.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                                            <span style={{ color: 'var(--text-2)' }}>{food.name} <span style={{ color: 'var(--text-3)' }}>— {food.quantity}{food.unit}</span></span>
                                            <span style={{ color: 'var(--text-3)' }}>{Math.round(food.calories)} kcal</span>
                                          </div>
                                        ))}
                                        {meal.foods.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Nenhum alimento nesta refeição.</p>}
                                      </div>
                                    </div>
                                  )
                                })}
                                {day.meals.length === 0 && <p style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-2)' }}>Nenhuma refeição neste dia.</p>}

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: 'var(--bg)' }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total do dia</span>
                                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.round(totals.cal)} kcal</span>
                                    <span style={{ color: 'var(--accent-text)' }}>P {Math.round(totals.p)}g</span>
                                    <span style={{ color: '#FF9800' }}>C {Math.round(totals.c)}g</span>
                                    <span style={{ color: '#FF4444' }}>G {Math.round(totals.f)}g</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
