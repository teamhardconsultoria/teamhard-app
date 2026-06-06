import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Modal, FlatList,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import { DatePickerField } from '@/components/DatePickerField'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface TacoFood {
  id: string; nome: string
  kcal_100g: number; proteina_g: number; gordura_g: number; carboidrato_g: number
}

interface FoodItem {
  name: string; quantity: string; unit: string
  calories: number; protein: number; carbs: number; fat: number
  taco: TacoFood | null
}

interface Meal { name: string; time: string; foods: FoodItem[] }
interface DietDay { label: string; weekdays: number[]; meals: Meal[] }

interface SavedDiet {
  id: string; name: string; valid_from: string; valid_to: string; active: boolean
  days: {
    id: string; label: string
    meals: { id: string; name: string; foods: { id: string; name: string; quantity: number; unit: string }[] }[]
  }[]
}

const round1 = (n: number) => Math.round(n * 10) / 10
const calcMacros = (t: TacoFood, qty: number) => ({
  calories: round1(t.kcal_100g * qty / 100),
  protein: round1(t.proteina_g * qty / 100),
  carbs: round1(t.carboidrato_g * qty / 100),
  fat: round1(t.gordura_g * qty / 100),
})

const emptyFood = (): FoodItem => ({ name: '', quantity: '100', unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, taco: null })
const emptyMeal = (): Meal => ({ name: '', time: '', foods: [emptyFood()] })
const emptyDay = (): DietDay => ({ label: '', weekdays: [], meals: [emptyMeal()] })

export default function CoachDiets() {
  const { id: studentId, name: studentName } = useLocalSearchParams<{ id: string; name: string }>()
  const { user } = useAuthStore()
  const [diets, setDiets] = useState<SavedDiet[]>([])
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [saving, setSaving] = useState(false)

  const [dName, setDName] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0])
  const [validTo, setValidTo] = useState('')
  const [days, setDays] = useState<DietDay[]>([emptyDay()])

  const [foodModal, setFoodModal] = useState(false)
  const [foodTarget, setFoodTarget] = useState<{ di: number; mi: number; fi: number } | null>(null)
  const [foodQuery, setFoodQuery] = useState('')
  const [foodResults, setFoodResults] = useState<TacoFood[]>([])
  const foodDebounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { loadDiets() }, [studentId])

  const loadDiets = async () => {
    const { data } = await supabase
      .from('diets')
      .select(`id, name, valid_from, valid_to, active,
        days:diet_days(id, label, sort_order,
          meals:meals(id, name, sort_order,
            foods:meal_foods(id, name, quantity, unit, sort_order)))`)
      .eq('student_id', studentId)
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })

    setDiets((data || []).map((d: any) => ({
      ...d,
      days: (d.days || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((day: any) => ({
          ...day,
          meals: (day.meals || [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((m: any) => ({ ...m, foods: (m.foods || []).sort((a: any, b: any) => a.sort_order - b.sort_order) })),
        })),
    })))
    setLoading(false)
  }

  const searchFoods = (q: string) => {
    setFoodQuery(q)
    clearTimeout(foodDebounce.current)
    if (q.length < 2) { setFoodResults([]); return }
    foodDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('alimentos')
        .select('id, nome, kcal_100g, proteina_g, gordura_g, carboidrato_g')
        .ilike('nome', `%${q}%`)
        .limit(20)
      setFoodResults(data || [])
    }, 250)
  }

  const openFoodSearch = (di: number, mi: number, fi: number) => {
    setFoodTarget({ di, mi, fi })
    setFoodQuery('')
    setFoodResults([])
    setFoodModal(true)
  }

  const selectTacoFood = (taco: TacoFood) => {
    if (!foodTarget) return
    const { di, mi, fi } = foodTarget
    const qty = parseFloat(days[di].meals[mi].foods[fi].quantity) || 100
    patchFood(di, mi, fi, { name: taco.nome, unit: 'g', taco, ...calcMacros(taco, qty) })
    setFoodModal(false)
  }

  const patchFood = (di: number, mi: number, fi: number, patch: Partial<FoodItem>) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      meals: d.meals.map((m, mi2) => mi2 !== mi ? m : {
        ...m,
        foods: m.foods.map((f, fi2) => fi2 !== fi ? f : { ...f, ...patch }),
      }),
    }))

  const handleQtyChange = (di: number, mi: number, fi: number, qtyStr: string) => {
    const food = days[di].meals[mi].foods[fi]
    const qty = parseFloat(qtyStr) || 0
    const patch: Partial<FoodItem> = { quantity: qtyStr }
    if (food.taco && qty > 0) Object.assign(patch, calcMacros(food.taco, qty))
    patchFood(di, mi, fi, patch)
  }

  const addFood = (di: number, mi: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      meals: d.meals.map((m, mi2) => mi2 !== mi ? m : { ...m, foods: [...m.foods, emptyFood()] }),
    }))

  const removeFood = (di: number, mi: number, fi: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      meals: d.meals.map((m, mi2) => mi2 !== mi ? m : {
        ...m, foods: m.foods.filter((_, fi2) => fi2 !== fi),
      }),
    }))

  const addMeal = (di: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, meals: [...d.meals, emptyMeal()] }))

  const removeMeal = (di: number, mi: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d, meals: d.meals.filter((_, mi2) => mi2 !== mi),
    }))

  const addDay = () => setDays(prev => [...prev, { ...emptyDay(), label: `Dia ${String.fromCharCode(65 + prev.length)}` }])
  const removeDay = (di: number) => setDays(prev => prev.filter((_, i) => i !== di))

  const toggleWeekday = (di: number, wd: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      weekdays: d.weekdays.includes(wd) ? d.weekdays.filter(x => x !== wd) : [...d.weekdays, wd],
    }))

  const handleSave = async () => {
    if (!dName.trim()) { Alert.alert('Atenção', 'Informe o nome da dieta.'); return }
    if (!validFrom || !validTo) { Alert.alert('Atenção', 'Informe as datas de início e fim.'); return }
    if (days.some(d => !d.label.trim())) { Alert.alert('Atenção', 'Nomeie todos os dias.'); return }
    if (days.some(d => d.meals.some(m => !m.name.trim()))) {
      Alert.alert('Atenção', 'Nomeie todas as refeições.'); return
    }

    setSaving(true)
    try {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      await supabase.from('diets').update({ active: false }).eq('student_id', studentId).eq('active', true)

      const { data: diet, error: dErr } = await supabase.from('diets').insert({
        student_id: studentId, coach_id: coach!.id,
        name: dName.trim(), valid_from: validFrom, valid_to: validTo, active: true,
      }).select().single()
      if (dErr) throw dErr

      for (const [di, day] of days.entries()) {
        const { data: dd, error: ddErr } = await supabase.from('diet_days').insert({
          diet_id: diet.id, label: day.label.trim(),
          weekday: day.weekdays, sort_order: di,
        }).select().single()
        if (ddErr) throw ddErr

        for (const [mi, meal] of day.meals.entries()) {
          const { data: ml, error: mlErr } = await supabase.from('meals').insert({
            diet_day_id: dd.id, name: meal.name.trim(),
            suggested_time: meal.time || null, sort_order: mi,
          }).select().single()
          if (mlErr) throw mlErr

          const foods = meal.foods.filter(f => f.name.trim())
          if (foods.length > 0) {
            await supabase.from('meal_foods').insert(
              foods.map((f, fi) => ({
                meal_id: ml.id,
                name: f.name.trim(),
                quantity: parseFloat(f.quantity) || 100,
                unit: f.unit || 'g',
                calories: f.calories,
                protein: f.protein,
                carbs: f.carbs,
                fat: f.fat,
                sort_order: fi,
              }))
            )
          }
        }
      }

      Alert.alert('Dieta salva!', 'Dieta criada com sucesso.', [{ text: 'OK' }])
      setBuilding(false)
      setDName(''); setValidFrom(new Date().toISOString().split('T')[0]); setValidTo('')
      setDays([emptyDay()])
      loadDiets()
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Dieta</Text>
          <Text style={s.pageSub}>{studentName}</Text>
        </View>
        {!building && (
          <TouchableOpacity style={s.newBtn} onPress={() => setBuilding(true)}>
            <Ionicons name="add" size={18} color="#0A0A0A" />
            <Text style={s.newBtnText}>Nova</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {building && (
          <View style={s.builderCard}>
            <Text style={s.builderTitle}>Nova Dieta</Text>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Nome *</Text>
              <TextInput style={s.input} value={dName} onChangeText={setDName}
                placeholder="Ex: Dieta de Cutting" placeholderTextColor={colors.subtext} />
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <DatePickerField label="Início *" value={validFrom} onChange={setValidFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerField label="Fim *" value={validTo} onChange={setValidTo}
                  minDate={validFrom ? new Date(validFrom + 'T12:00:00') : undefined} />
              </View>
            </View>

            {days.map((day, di) => (
              <View key={di} style={s.dayCard}>
                <View style={s.dayHeader}>
                  <TextInput style={[s.input, { flex: 1 }]} value={day.label}
                    onChangeText={v => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, label: v }))}
                    placeholder={`Dia ${String.fromCharCode(65 + di)}`}
                    placeholderTextColor={colors.subtext} />
                  {days.length > 1 && (
                    <TouchableOpacity onPress={() => removeDay(di)} style={s.removeBtn}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.weekdays}>
                  {WEEKDAYS.map((wd, wdi) => (
                    <TouchableOpacity key={wdi} onPress={() => toggleWeekday(di, wdi)}
                      style={[s.wdChip, day.weekdays.includes(wdi) && s.wdChipActive]}>
                      <Text style={[s.wdText, day.weekdays.includes(wdi) && s.wdTextActive]}>{wd}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {day.meals.map((meal, mi) => (
                  <View key={mi} style={s.mealCard}>
                    <View style={s.mealHeader}>
                      <TextInput style={[s.input, { flex: 1, fontSize: 13 }]} value={meal.name}
                        onChangeText={v => setDays(prev => prev.map((d, i) => i !== di ? d : {
                          ...d, meals: d.meals.map((m, mi2) => mi2 !== mi ? m : { ...m, name: v }),
                        }))}
                        placeholder="Nome da refeição" placeholderTextColor={colors.subtext} />
                      <TextInput style={[s.input, { width: 72, fontSize: 13 }]} value={meal.time}
                        onChangeText={v => setDays(prev => prev.map((d, i) => i !== di ? d : {
                          ...d, meals: d.meals.map((m, mi2) => mi2 !== mi ? m : { ...m, time: v }),
                        }))}
                        placeholder="HH:MM" placeholderTextColor={colors.subtext} />
                      {day.meals.length > 1 && (
                        <TouchableOpacity onPress={() => removeMeal(di, mi)} style={s.removeBtn}>
                          <Ionicons name="close-circle" size={18} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {meal.foods.map((food, fi) => (
                      <View key={fi} style={s.foodRow}>
                        <View style={s.foodNameRow}>
                          <TouchableOpacity style={s.foodSearchBtn} onPress={() => openFoodSearch(di, mi, fi)}>
                            {food.taco
                              ? <Text style={s.foodNameText} numberOfLines={1}>{food.name}</Text>
                              : <Text style={s.foodNamePlaceholder}>{food.name || 'Buscar alimento (TACO)...'}</Text>
                            }
                            <Ionicons name="search" size={13} color={colors.subtext} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeFood(di, mi, fi)}>
                            <Ionicons name="close-circle" size={16} color={colors.muted} />
                          </TouchableOpacity>
                        </View>
                        <View style={s.foodParams}>
                          <View style={[s.macroParam, { maxWidth: 72 }]}>
                            <Text style={s.macroLabel}>Qtd (g)</Text>
                            <TextInput style={s.macroInput} value={food.quantity} keyboardType="decimal-pad"
                              onChangeText={v => handleQtyChange(di, mi, fi, v)} />
                          </View>
                          {food.taco && (
                            <>
                              <View style={s.macroParam}>
                                <Text style={s.macroLabel}>Kcal</Text>
                                <TextInput style={[s.macroInput, s.macroReadonly]} value={String(food.calories)} editable={false} />
                              </View>
                              <View style={s.macroParam}>
                                <Text style={s.macroLabel}>Prot</Text>
                                <TextInput style={[s.macroInput, s.macroReadonly]} value={String(food.protein)} editable={false} />
                              </View>
                              <View style={s.macroParam}>
                                <Text style={s.macroLabel}>Carb</Text>
                                <TextInput style={[s.macroInput, s.macroReadonly]} value={String(food.carbs)} editable={false} />
                              </View>
                              <View style={s.macroParam}>
                                <Text style={s.macroLabel}>Gord</Text>
                                <TextInput style={[s.macroInput, s.macroReadonly]} value={String(food.fat)} editable={false} />
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity style={s.addBtn} onPress={() => addFood(di, mi)}>
                      <Ionicons name="add" size={14} color={colors.yellow} />
                      <Text style={s.addBtnText}>Adicionar alimento</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={s.addMealBtn} onPress={() => addMeal(di)}>
                  <Ionicons name="add" size={14} color={colors.subtext} />
                  <Text style={s.addMealText}>Adicionar refeição</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={s.addDayBtn} onPress={addDay}>
              <Ionicons name="add" size={16} color={colors.subtext} />
              <Text style={s.addDayText}>Adicionar dia</Text>
            </TouchableOpacity>

            <View style={s.builderActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setBuilding(false)}>
                <Text style={s.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#0A0A0A" size="small" />
                  : <Text style={s.saveBtnText}>Salvar Dieta</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {diets.length === 0 && !building ? (
          <View style={s.empty}>
            <Ionicons name="nutrition-outline" size={40} color={colors.subtext} />
            <Text style={s.emptyText}>Nenhuma dieta cadastrada.</Text>
            <TouchableOpacity style={s.newBtn} onPress={() => setBuilding(true)}>
              <Ionicons name="add" size={18} color="#0A0A0A" />
              <Text style={s.newBtnText}>Criar Dieta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          diets.map(diet => (
            <View key={diet.id} style={[s.dietCard, diet.active && s.dietCardActive]}>
              <View style={s.dietHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.dietName}>{diet.name}</Text>
                  <Text style={s.dietDates}>
                    {new Date(diet.valid_from).toLocaleDateString('pt-BR')} → {new Date(diet.valid_to).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                {diet.active && <View style={s.activeBadge}><Text style={s.activeBadgeText}>ATIVA</Text></View>}
              </View>
              {diet.days.map(d => (
                <View key={d.id} style={s.dayPreview}>
                  <Text style={s.dayPreviewName}>{d.label}</Text>
                  {d.meals.slice(0, 3).map(m => (
                    <Text key={m.id} style={s.dayPreviewMeal}>· {m.name} ({m.foods.length} alim.)</Text>
                  ))}
                  {d.meals.length > 3 && (
                    <Text style={s.dayPreviewMore}>+{d.meals.length - 3} refeições</Text>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={foodModal} animationType="slide" transparent>
        <View style={s.modal}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Buscar Alimento (TACO)</Text>
              <TouchableOpacity onPress={() => setFoodModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color={colors.subtext} />
              <TextInput style={s.searchInput} value={foodQuery} onChangeText={searchFoods}
                placeholder="Nome do alimento..." placeholderTextColor={colors.subtext} autoFocus />
            </View>
            <FlatList
              data={foodResults}
              keyExtractor={f => f.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.foodResult} onPress={() => selectTacoFood(item)}>
                  <Text style={s.foodResultName}>{item.nome}</Text>
                  <Text style={s.foodResultMacro}>
                    {item.kcal_100g} kcal · P:{item.proteina_g}g · C:{item.carboidrato_g}g · G:{item.gordura_g}g (por 100g)
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                foodQuery.length >= 2
                  ? <Text style={s.modalEmpty}>Nenhum alimento encontrado.</Text>
                  : <Text style={s.modalEmpty}>Digite para buscar...</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  pageSub: { fontSize: 12, color: colors.subtext },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  newBtnText: { fontSize: 13, fontWeight: '800', color: '#0A0A0A' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: colors.subtext, fontSize: 14 },
  builderCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  builderTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
  },
  row: { flexDirection: 'row', gap: 10 },
  dayCard: { backgroundColor: colors.dark, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: { padding: 6 },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  wdChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  wdChipActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  wdText: { fontSize: 10, fontWeight: '700', color: colors.subtext },
  wdTextActive: { color: '#0A0A0A' },
  mealCard: { backgroundColor: colors.card, borderRadius: 10, padding: 10, gap: 6 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodRow: { backgroundColor: colors.dark, borderRadius: 8, padding: 8, gap: 4 },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodSearchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.border + '50', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  foodNameText: { fontSize: 12, color: colors.text, flex: 1 },
  foodNamePlaceholder: { fontSize: 12, color: colors.subtext, flex: 1 },
  foodParams: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroParam: { flex: 1, gap: 2 },
  macroLabel: { fontSize: 9, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  macroInput: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, fontSize: 12, color: colors.text, textAlign: 'center',
  },
  macroReadonly: { borderColor: colors.yellow + '40', color: colors.yellow },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addBtnText: { fontSize: 12, color: colors.yellow, fontWeight: '600' },
  addMealBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 4 },
  addMealText: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
  addDayBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderWidth: 1, borderColor: colors.muted, borderRadius: 10, borderStyle: 'dashed',
  },
  addDayText: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  builderActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.subtext, fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.yellow, alignItems: 'center' },
  saveBtnText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  dietCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  dietCardActive: { borderColor: colors.yellow + '50' },
  dietHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dietName: { fontSize: 15, fontWeight: '700', color: colors.text },
  dietDates: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  activeBadge: { backgroundColor: colors.yellow + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.yellow + '40' },
  activeBadgeText: { fontSize: 9, fontWeight: '900', color: colors.yellow, letterSpacing: 1 },
  dayPreview: { backgroundColor: colors.dark, borderRadius: 8, padding: 10, gap: 3 },
  dayPreviewName: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  dayPreviewMeal: { fontSize: 11, color: colors.subtext },
  dayPreviewMore: { fontSize: 10, color: colors.muted, fontStyle: 'italic' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  foodResult: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  foodResultName: { fontSize: 14, fontWeight: '600', color: colors.text },
  foodResultMacro: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  modalEmpty: { color: colors.subtext, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
})
