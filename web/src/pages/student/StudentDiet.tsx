import { useEffect, useState, useRef } from 'react'
import { ChevronLeft, ChevronRight as ChevronRightIcon, Salad, CheckCircle2, Camera, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Food { id: string; name: string; quantity: string; unit: string; calories?: number; protein?: number; carbs?: number; fat?: number }
interface Meal { id: string; name: string; time?: string; sort_order: number; foods: Food[] }
interface DietDay { id: string; name: string; sort_order: number; meals: Meal[] }
interface Diet { id: string; name: string; valid_from: string; valid_to: string; days: DietDay[] }
interface DietLog { id: string; finalized_at: string | null }

const spin: React.CSSProperties = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }
const today = new Date().toISOString().split('T')[0]

export default function StudentDiet() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [diet, setDiet] = useState<Diet | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDayIdx, setCurrentDayIdx] = useState(0)

  const [studentId, setStudentId] = useState<string | null>(null)
  const [dietLog, setDietLog] = useState<DietLog | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [finalized, setFinalized] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fotos de refeição
  const [mealPhotos, setMealPhotos] = useState<Record<string, string>>({})
  const [uploadingMeals, setUploadingMeals] = useState<Set<string>>(new Set())
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id, diet_enabled').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    if (!(student as any).diet_enabled) { setLoading(false); return }
    setStudentId(student.id)

    const { data } = await supabase.from('diets').select(`
      id, name, valid_from, valid_to,
      days:diet_days(
        id, name:label, sort_order,
        meals:meals(
          id, name, time:suggested_time, sort_order,
          foods:meal_foods(id, name, quantity, unit, calories, protein, carbs, fat, sort_order)
        )
      )
    `).eq('student_id', student.id).eq('active', true).order('valid_from', { ascending: false }).limit(1).maybeSingle()

    if (data) {
      setDiet(data as any)
      const days = ((data as any).days || []).sort((a: DietDay, b: DietDay) => a.sort_order - b.sort_order)
      if (days.length > 0) await fetchLog(student.id, days[0].id)
    }
    setLoading(false)
  }

  const fetchLog = async (sid: string, dayId: string) => {
    setChecks({})
    setFinalized(false)
    setDietLog(null)
    setMealPhotos({})

    let { data: log } = await supabase
      .from('diet_logs').select('id, finalized_at')
      .eq('student_id', sid).eq('diet_day_id', dayId).eq('date', today)
      .maybeSingle()

    if (!log) {
      const { data: newLog } = await supabase
        .from('diet_logs').insert({ student_id: sid, diet_day_id: dayId, date: today })
        .select('id, finalized_at').single()
      log = newLog
    }

    if (!log) return
    setDietLog(log)
    setFinalized(!!log.finalized_at)

    const [{ data: foodChecks }, { data: photos }] = await Promise.all([
      supabase.from('food_checks').select('meal_food_id, checked').eq('diet_log_id', log.id),
      supabase.from('meal_photos').select('meal_id, photo_url').eq('diet_log_id', log.id),
    ])

    const checkMap: Record<string, boolean> = {}
    foodChecks?.forEach((fc: any) => { checkMap[fc.meal_food_id] = fc.checked })
    setChecks(checkMap)

    const photoMap: Record<string, string> = {}
    photos?.forEach((p: any) => { photoMap[p.meal_id] = p.photo_url })
    setMealPhotos(photoMap)
  }

  const handleDayChange = async (idx: number) => {
    setCurrentDayIdx(idx)
    if (!studentId || !diet) return
    const days = diet.days.sort((a, b) => a.sort_order - b.sort_order)
    if (days[idx]) await fetchLog(studentId, days[idx].id)
  }

  const toggleCheck = async (foodId: string) => {
    if (!dietLog || finalized) return
    const newVal = !checks[foodId]
    setChecks(prev => ({ ...prev, [foodId]: newVal }))
    await supabase.from('food_checks').upsert({
      diet_log_id: dietLog.id,
      meal_food_id: foodId,
      checked: newVal,
      checked_at: newVal ? new Date().toISOString() : null,
    }, { onConflict: 'diet_log_id,meal_food_id' })
  }

  const handleMealPhoto = async (mealId: string, file: File) => {
    if (!dietLog || !studentId) return
    setUploadingMeals(prev => new Set([...prev, mealId]))

    const path = `meals/${studentId}/${dietLog.id}/${mealId}`
    const { error } = await supabase.storage
      .from('meal-photos')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('meal-photos').getPublicUrl(path)
      await supabase.from('meal_photos').upsert(
        { diet_log_id: dietLog.id, meal_id: mealId, photo_url: publicUrl },
        { onConflict: 'diet_log_id,meal_id' }
      )
      // cache bust para exibir a nova foto imediatamente
      setMealPhotos(prev => ({ ...prev, [mealId]: publicUrl + '?t=' + Date.now() }))
    }

    setUploadingMeals(prev => { const s = new Set(prev); s.delete(mealId); return s })
    // limpa o input para permitir re-seleção do mesmo arquivo
    if (fileInputRefs.current[mealId]) fileInputRefs.current[mealId]!.value = ''
  }

  const removeMealPhoto = async (mealId: string) => {
    if (!dietLog || !studentId) return
    const path = `meals/${studentId}/${dietLog.id}/${mealId}`
    await Promise.all([
      supabase.from('meal_photos').delete().eq('diet_log_id', dietLog.id).eq('meal_id', mealId),
      supabase.storage.from('meal-photos').remove([path]),
    ])
    setMealPhotos(prev => { const m = { ...prev }; delete m[mealId]; return m })
  }

  const handleFinalize = async () => {
    if (!dietLog || finalized) return
    setSaving(true)
    await supabase.from('diet_logs').update({ finalized_at: new Date().toISOString() }).eq('id', dietLog.id)
    setFinalized(true)
    setSaving(false)
  }

  const pad = isMobile ? '20px 16px 48px' : '40px 32px 48px'

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  if (!diet) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', gap:12 }}>
      <Salad size={48} color="var(--border)" />
      <p style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>Sem dieta ativa</p>
      <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>Aguarde seu coach criar sua dieta.</p>
    </div>
  )

  const days = diet.days?.sort((a, b) => a.sort_order - b.sort_order) || []
  const currentDay = days[currentDayIdx]

  const checkedFoods = currentDay?.meals?.flatMap(m => m.foods.filter(f => checks[f.id])) || []
  const totals = checkedFoods.reduce((acc, f) => ({
    cal:  acc.cal  + (f.calories || 0),
    prot: acc.prot + (f.protein  || 0),
    carb: acc.carb + (f.carbs    || 0),
    fat:  acc.fat  + (f.fat      || 0),
  }), { cal:0, prot:0, carb:0, fat:0 })

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
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'8px 12px' }}>
            <button onClick={() => handleDayChange(Math.max(0, currentDayIdx - 1))} disabled={currentDayIdx === 0}
              style={{ background:'none', border:'none', cursor: currentDayIdx === 0 ? 'not-allowed' : 'pointer', color: currentDayIdx === 0 ? 'var(--border)' : 'var(--text-2)', padding:4, display:'flex', alignItems:'center' }}>
              <ChevronLeft size={18} />
            </button>
            <p style={{ flex:1, textAlign:'center', fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{currentDay?.name}</p>
            <button onClick={() => handleDayChange(Math.min(days.length - 1, currentDayIdx + 1))} disabled={currentDayIdx === days.length - 1}
              style={{ background:'none', border:'none', cursor: currentDayIdx === days.length - 1 ? 'not-allowed' : 'pointer', color: currentDayIdx === days.length - 1 ? 'var(--border)' : 'var(--text-2)', padding:4, display:'flex', alignItems:'center' }}>
              <ChevronRightIcon size={18} />
            </button>
          </div>
        )}

        {/* Barra de progresso de macros */}
        {checkedFoods.length > 0 && (
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <span style={{ fontSize:20, fontWeight:900, color:'var(--text)' }}>{Math.round(totals.cal)}</span>
              <span style={{ fontSize:12, color:'var(--text-2)', marginLeft:4 }}>kcal consumidas</span>
            </div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
              <MacroChip label="Prot" value={Math.round(totals.prot)} color="#4FC3F7" />
              <MacroChip label="Carb" value={Math.round(totals.carb)} color="#FFB74D" />
              <MacroChip label="Gord" value={Math.round(totals.fat)}  color="#F06292" />
            </div>
          </div>
        )}

        {/* Refeições */}
        {currentDay && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {currentDay.meals?.sort((a, b) => a.sort_order - b.sort_order).map(meal => (
              <div key={meal.id} style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>

                {/* Cabeçalho da refeição */}
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

                {/* Alimentos */}
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {meal.foods?.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(food => {
                    const checked = !!checks[food.id]
                    return (
                      <button key={food.id} onClick={() => toggleCheck(food.id)}
                        disabled={finalized}
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom:'1px solid var(--border)', cursor: finalized ? 'default' : 'pointer', textAlign:'left', backgroundColor: checked ? 'rgba(232,255,0,0.04)' : 'transparent', width:'100%' }}>
                        <div style={{ width:20, height:20, borderRadius:5, border:`2px solid ${checked ? '#E8FF00' : 'var(--border)'}`, backgroundColor: checked ? '#E8FF00' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                          {checked && <span style={{ fontSize:12, fontWeight:900, color:'#0A0A0A', lineHeight:1 }}>✓</span>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, color: checked ? 'var(--text-2)' : 'var(--text)', margin:0, textDecoration: checked ? 'line-through' : 'none' }}>{food.name}</p>
                          <p style={{ fontSize:11, color:'var(--text-2)', margin:'2px 0 0' }}>{food.quantity} {food.unit}{food.protein ? ` · P:${food.protein}g C:${food.carbs}g G:${food.fat}g` : ''}</p>
                        </div>
                        {food.calories ? <span style={{ fontSize:12, color: checked ? '#E8FF00' : 'var(--text-2)', fontWeight: checked ? 700 : 400, flexShrink:0 }}>{food.calories} kcal</span> : null}
                      </button>
                    )
                  })}
                </div>

                {/* ── Foto da refeição ── */}
                {dietLog && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {uploadingMeals.has(meal.id) ? (
                      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13 }}>
                        <div style={{ width: 14, height: 14, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                        Enviando foto...
                      </div>
                    ) : mealPhotos[meal.id] ? (
                      <>
                        <img
                          src={mealPhotos[meal.id]}
                          alt={`Foto: ${meal.name}`}
                          style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                          <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                            <Camera size={13} /> Trocar foto
                            <input
                              ref={el => { fileInputRefs.current[meal.id] = el }}
                              type="file" accept="image/*" capture="environment"
                              style={{ display: 'none' }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleMealPhoto(meal.id, f) }}
                            />
                          </label>
                          <button onClick={() => removeMealPhoto(meal.id)}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 12, color: '#FF4444', background: 'none' }}>
                            <X size={13} /> Remover
                          </button>
                        </div>
                      </>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', cursor: 'pointer' }}>
                        <Camera size={15} color="var(--text-2)" />
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Adicionar foto da refeição</span>
                        <input
                          ref={el => { fileInputRefs.current[meal.id] = el }}
                          type="file" accept="image/*" capture="environment"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleMealPhoto(meal.id, f) }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Macros da refeição */}
                {(() => {
                  const p = meal.foods?.reduce((s, f) => s + (f.protein || 0), 0)
                  const c = meal.foods?.reduce((s, f) => s + (f.carbs || 0), 0)
                  const fat = meal.foods?.reduce((s, f) => s + (f.fat || 0), 0)
                  if (!p && !c && !fat) return null
                  return (
                    <div style={{ padding:'8px 16px 12px', display:'flex', gap:16, borderTop: '1px solid var(--border)' }}>
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

        {/* Botão finalizar / badge finalizado */}
        <div style={{ marginTop:20 }}>
          {finalized ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, backgroundColor:'rgba(0,200,83,0.08)', border:'1px solid rgba(0,200,83,0.25)', borderRadius:14, padding:'16px' }}>
              <CheckCircle2 size={22} color="#00C853" />
              <span style={{ fontSize:15, fontWeight:700, color:'#00C853' }}>Dia finalizado!</span>
            </div>
          ) : (
            <button onClick={handleFinalize} disabled={saving || !dietLog}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, backgroundColor:'#E8FF00', border:'none', borderRadius:14, padding:'16px', cursor: saving || !dietLog ? 'not-allowed' : 'pointer', fontSize:15, fontWeight:900, color:'#0A0A0A', letterSpacing:1.5, opacity: saving || !dietLog ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : '✓ FINALIZAR DIA'}
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width:8, height:8, borderRadius:4, backgroundColor:color }} />
      <span style={{ fontSize:12, color:'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{value}g</span>
    </div>
  )
}
