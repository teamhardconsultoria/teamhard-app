import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight as ChevronRightIcon, Salad } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Food { id: string; name: string; quantity: string; unit: string; calories?: number; protein?: number; carbs?: number; fat?: number }
interface Meal { id: string; name: string; time?: string; sort_order: number; foods: Food[] }
interface DietDay { id: string; name: string; sort_order: number; meals: Meal[] }
interface Diet { id: string; name: string; valid_from: string; valid_to: string; days: DietDay[] }

const spin = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

export default function StudentDiet() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [diet, setDiet] = useState<Diet | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDayIdx, setCurrentDayIdx] = useState(0)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    const { data } = await supabase.from('diets').select(`
      id, name, valid_from, valid_to,
      days:diet_days(
        id, name, sort_order,
        meals:meals(
          id, name, time, sort_order,
          foods:meal_foods(id, name, quantity, unit, calories, protein, carbs, fat, sort_order)
        )
      )
    `).eq('student_id', student.id).eq('active', true).order('valid_from', { ascending: false }).limit(1).maybeSingle()
    setDiet(data as any)
    setLoading(false)
  }

  const pad = isMobile ? '20px 16px 48px' : '40px 32px 48px'

  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}><div style={spin} /></div>

  if (!diet) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', gap:12 }}>
      <Salad size={48} color="var(--border)" />
      <p style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>Sem dieta ativa</p>
      <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>Aguarde seu coach criar sua dieta.</p>
    </div>
  )

  const days = diet.days?.sort((a, b) => a.sort_order - b.sort_order) || []
  const currentDay = days[currentDayIdx]

  return (
    <div style={{ flex:1, overflowY:'auto', backgroundColor:'var(--bg)' }}>
      <div style={{ padding: pad, maxWidth: 720 }}>
        <div style={{ marginBottom:20 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:'0 0 4px' }}>{diet.name}</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>
            Válido de {new Date(diet.valid_from + 'T12:00:00').toLocaleDateString('pt-BR')} até {new Date(diet.valid_to + 'T12:00:00').toLocaleDateString('pt-BR')}
          </p>
        </div>

        {/* Seletor de dia */}
        {days.length > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'8px 12px' }}>
            <button onClick={() => setCurrentDayIdx(i => Math.max(0, i - 1))} disabled={currentDayIdx === 0}
              style={{ background:'none', border:'none', cursor: currentDayIdx === 0 ? 'not-allowed' : 'pointer', color: currentDayIdx === 0 ? 'var(--border)' : 'var(--text-2)', padding:4, display:'flex', alignItems:'center' }}>
              <ChevronLeft size={18} />
            </button>
            <p style={{ flex:1, textAlign:'center', fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{currentDay?.name}</p>
            <button onClick={() => setCurrentDayIdx(i => Math.min(days.length - 1, i + 1))} disabled={currentDayIdx === days.length - 1}
              style={{ background:'none', border:'none', cursor: currentDayIdx === days.length - 1 ? 'not-allowed' : 'pointer', color: currentDayIdx === days.length - 1 ? 'var(--border)' : 'var(--text-2)', padding:4, display:'flex', alignItems:'center' }}>
              <ChevronRightIcon size={18} />
            </button>
          </div>
        )}

        {/* Refeições */}
        {currentDay && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {currentDay.meals?.sort((a, b) => a.sort_order - b.sort_order).map(meal => (
              <div key={meal.id} style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{meal.name}</p>
                    {meal.time && <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{meal.time}</p>}
                  </div>
                  {(() => {
                    const kcal = meal.foods?.reduce((s, f) => s + (f.calories || 0), 0)
                    return kcal ? <span style={{ fontSize:12, fontWeight:700, color:'var(--text-2)' }}>{kcal} kcal</span> : null
                  })()}
                </div>
                <div style={{ padding:'10px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                  {meal.foods?.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(food => (
                    <div key={food.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <p style={{ fontSize:13, color:'var(--text)', margin:0, flex:1 }}>{food.name}</p>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                        <span style={{ fontSize:12, color:'var(--text-2)' }}>{food.quantity} {food.unit}</span>
                        {food.calories ? <span style={{ fontSize:11, color:'var(--text-3)' }}>{food.calories} kcal</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Macros totais */}
                {(() => {
                  const p = meal.foods?.reduce((s, f) => s + (f.protein || 0), 0)
                  const c = meal.foods?.reduce((s, f) => s + (f.carbs || 0), 0)
                  const fat = meal.foods?.reduce((s, f) => s + (f.fat || 0), 0)
                  if (!p && !c && !fat) return null
                  return (
                    <div style={{ padding:'8px 16px 12px', display:'flex', gap:16 }}>
                      {p ? <Macro label="Prot" value={`${p}g`} /> : null}
                      {c ? <Macro label="Carb" value={`${c}g`} /> : null}
                      {fat ? <Macro label="Gord" value={`${fat}g`} /> : null}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      <span style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:700, color:'var(--text-2)' }}>{value}</span>
    </div>
  )
}
