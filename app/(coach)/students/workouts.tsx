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

interface Exercise { id: string; name: string; muscle_groups: string[] }
interface WorkoutEx { exercise: Exercise | null; sets: string; reps: string; rest: string; notes: string }
interface WorkoutDay { name: string; weekdays: number[]; exercises: WorkoutEx[] }

interface SavedWorkout {
  id: string; name: string; valid_from: string; valid_to: string; active: boolean
  days: { id: string; name: string; exercises: { id: string; exercise: { name: string }; sets: number; reps: string }[] }[]
}

const emptyEx = (): WorkoutEx => ({ exercise: null, sets: '3', reps: '10-12', rest: '60', notes: '' })
const emptyDay = (): WorkoutDay => ({ name: '', weekdays: [], exercises: [emptyEx()] })

export default function CoachWorkouts() {
  const { id: studentId, name: studentName } = useLocalSearchParams<{ id: string; name: string }>()
  const { user } = useAuthStore()
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [saving, setSaving] = useState(false)

  // Builder state
  const [wName, setWName] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0])
  const [validTo, setValidTo] = useState('')
  const [days, setDays] = useState<WorkoutDay[]>([emptyDay()])

  // Exercise search modal
  const [searchModal, setSearchModal] = useState(false)
  const [searchTarget, setSearchTarget] = useState<{ di: number; ei: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Exercise[]>([])
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>()

  // Template picker
  const [templateModal, setTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string }[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => { loadWorkouts() }, [studentId])

  const loadWorkouts = async () => {
    const { data } = await supabase
      .from('workouts')
      .select(`id, name, valid_from, valid_to, active,
        days:workout_days(id, name, sort_order,
          exercises:workout_exercises(id, sets, reps,
            exercise:exercises(name)))`)
      .eq('student_id', studentId)
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })

    setWorkouts((data || []).map((w: any) => ({
      ...w,
      days: (w.days || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((d: any) => ({ ...d, exercises: d.exercises || [] })),
    })))
    setLoading(false)
  }

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    const { data } = await supabase
      .from('workout_templates')
      .select('id, name, description')
      .eq('active', true)
      .order('name')
    setTemplates(data || [])
    setLoadingTemplates(false)
  }

  const applyTemplate = async (tpl: { id: string; name: string }) => {
    setTemplateModal(false)
    const { data: tplDays } = await supabase
      .from('template_days')
      .select('id, name, weekday_suggestion, sort_order, exercises:template_exercises(sets, reps, rest_seconds, coach_notes, sort_order, exercise:exercises(id, name, muscle_groups))')
      .eq('template_id', tpl.id)
      .order('sort_order')

    if (!tplDays?.length) { Alert.alert('Template vazio', 'Este template não possui divisões.'); return }

    setDays(tplDays.map((d: any) => ({
      name: d.name,
      weekdays: d.weekday_suggestion || [],
      exercises: (d.exercises || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((e: any) => ({
          exercise: e.exercise,
          sets: String(e.sets),
          reps: e.reps,
          rest: String(e.rest_seconds),
          notes: e.coach_notes || '',
        })),
    })))
    if (!wName.trim()) setWName(tpl.name)
    setTemplateId(tpl.id)
  }

  const searchExercises = (q: string) => {
    setSearchQuery(q)
    clearTimeout(searchDebounce.current)
    if (q.length < 2) { setSearchResults([]); return }
    searchDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_groups')
        .ilike('name', `%${q}%`)
        .eq('active', true)
        .limit(20)
      setSearchResults(data || [])
    }, 250)
  }

  const openExerciseSearch = (di: number, ei: number) => {
    setSearchTarget({ di, ei })
    setSearchQuery('')
    setSearchResults([])
    setSearchModal(true)
  }

  const selectExercise = (exercise: Exercise) => {
    if (!searchTarget) return
    const { di, ei } = searchTarget
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      exercises: d.exercises.map((e, j) => j !== ei ? e : { ...e, exercise }),
    }))
    setSearchModal(false)
  }

  const updateEx = (di: number, ei: number, field: keyof WorkoutEx, val: string) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      exercises: d.exercises.map((e, j) => j !== ei ? e : { ...e, [field]: val }),
    }))

  const addExercise = (di: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, exercises: [...d.exercises, emptyEx()] }))

  const removeExercise = (di: number, ei: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d, exercises: d.exercises.filter((_, j) => j !== ei),
    }))

  const toggleWeekday = (di: number, wd: number) =>
    setDays(prev => prev.map((d, i) => i !== di ? d : {
      ...d,
      weekdays: d.weekdays.includes(wd) ? d.weekdays.filter(x => x !== wd) : [...d.weekdays, wd],
    }))

  const addDay = () => setDays(prev => [...prev, { ...emptyDay(), name: `Divisão ${String.fromCharCode(65 + prev.length)}` }])
  const removeDay = (di: number) => setDays(prev => prev.filter((_, i) => i !== di))

  const handleSave = async () => {
    if (!wName.trim()) { Alert.alert('Atenção', 'Informe o nome do treino.'); return }
    if (!validFrom || !validTo) { Alert.alert('Atenção', 'Informe as datas de início e fim.'); return }
    if (days.some(d => !d.name.trim())) { Alert.alert('Atenção', 'Nomeie todas as divisões.'); return }
    if (days.some(d => d.exercises.every(e => !e.exercise))) {
      Alert.alert('Atenção', 'Adicione ao menos um exercício em cada divisão.')
      return
    }

    setSaving(true)
    try {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      await supabase.from('workouts').update({ active: false }).eq('student_id', studentId).eq('active', true)

      const { data: workout, error: wErr } = await supabase.from('workouts').insert({
        student_id: studentId, coach_id: coach!.id,
        name: wName.trim(), valid_from: validFrom, valid_to: validTo, active: true,
        based_on_template_id: templateId || null,
      }).select().single()
      if (wErr) throw wErr

      for (const [di, day] of days.entries()) {
        const { data: wd, error: dErr } = await supabase.from('workout_days').insert({
          workout_id: workout.id, name: day.name.trim(),
          weekday_suggestion: day.weekdays, sort_order: di,
        }).select().single()
        if (dErr) throw dErr

        const validExercises = day.exercises.filter(e => e.exercise)
        if (validExercises.length > 0) {
          await supabase.from('workout_exercises').insert(
            validExercises.map((e, ei) => ({
              workout_day_id: wd.id,
              exercise_id: e.exercise!.id,
              sets: parseInt(e.sets) || 3,
              reps: e.reps || '10-12',
              rest_seconds: parseInt(e.rest) || 60,
              coach_notes: e.notes || null,
              sort_order: ei,
            }))
          )
        }
      }

      Alert.alert('Treino salvo!', 'Treino criado com sucesso.', [{ text: 'OK' }])
      setBuilding(false)
      setWName(''); setValidFrom(new Date().toISOString().split('T')[0]); setValidTo('')
      setDays([emptyDay()]); setTemplateId(null)
      loadWorkouts()
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Treinos</Text>
          <Text style={s.pageSub}>{studentName}</Text>
        </View>
        {!building && (
          <TouchableOpacity style={s.newBtn} onPress={() => setBuilding(true)}>
            <Ionicons name="add" size={18} color="#0A0A0A" />
            <Text style={s.newBtnText}>Novo</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Builder */}
        {building && (
          <View style={s.builderCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.builderTitle}>Novo Treino</Text>
              <TouchableOpacity style={s.tplBtn} onPress={() => { loadTemplates(); setTemplateModal(true) }}>
                <Ionicons name="copy-outline" size={13} color={colors.yellow} />
                <Text style={s.tplBtnText}>Usar template</Text>
              </TouchableOpacity>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Nome *</Text>
              <TextInput style={s.input} value={wName} onChangeText={setWName}
                placeholder="Ex: Treino de Hipertrofia" placeholderTextColor={colors.subtext} />
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

            {/* Days */}
            {days.map((day, di) => (
              <View key={di} style={s.dayCard}>
                <View style={s.dayHeader}>
                  <TextInput style={[s.input, { flex: 1 }]} value={day.name}
                    onChangeText={v => setDays(prev => prev.map((d, i) => i !== di ? d : { ...d, name: v }))}
                    placeholder={`Divisão ${String.fromCharCode(65 + di)}`}
                    placeholderTextColor={colors.subtext} />
                  {days.length > 1 && (
                    <TouchableOpacity onPress={() => removeDay(di)} style={s.removeBtn}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Weekdays */}
                <View style={s.weekdays}>
                  {WEEKDAYS.map((wd, wdi) => (
                    <TouchableOpacity key={wdi} onPress={() => toggleWeekday(di, wdi)}
                      style={[s.wdChip, day.weekdays.includes(wdi) && s.wdChipActive]}>
                      <Text style={[s.wdText, day.weekdays.includes(wdi) && s.wdTextActive]}>{wd}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Exercises */}
                {day.exercises.map((ex, ei) => (
                  <View key={ei} style={s.exRow}>
                    <TouchableOpacity style={s.exName} onPress={() => openExerciseSearch(di, ei)}>
                      {ex.exercise ? (
                        <Text style={s.exNameText} numberOfLines={1}>{ex.exercise.name}</Text>
                      ) : (
                        <Text style={s.exNamePlaceholder}>Buscar exercício...</Text>
                      )}
                      <Ionicons name="search" size={14} color={colors.subtext} />
                    </TouchableOpacity>
                    <View style={s.exParams}>
                      <View style={s.exParam}>
                        <Text style={s.exParamLabel}>Séries</Text>
                        <TextInput style={s.exParamInput} value={ex.sets} keyboardType="number-pad"
                          onChangeText={v => updateEx(di, ei, 'sets', v)} />
                      </View>
                      <View style={s.exParam}>
                        <Text style={s.exParamLabel}>Reps</Text>
                        <TextInput style={s.exParamInput} value={ex.reps}
                          onChangeText={v => updateEx(di, ei, 'reps', v)} />
                      </View>
                      <View style={s.exParam}>
                        <Text style={s.exParamLabel}>Desc (s)</Text>
                        <TextInput style={s.exParamInput} value={ex.rest} keyboardType="number-pad"
                          onChangeText={v => updateEx(di, ei, 'rest', v)} />
                      </View>
                      {day.exercises.length > 1 && (
                        <TouchableOpacity onPress={() => removeExercise(di, ei)}>
                          <Ionicons name="close-circle" size={18} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput style={[s.input, { fontSize: 12, marginTop: 4 }]} value={ex.notes}
                      onChangeText={v => updateEx(di, ei, 'notes', v)}
                      placeholder="Observação (opcional)" placeholderTextColor={colors.subtext} />
                  </View>
                ))}

                <TouchableOpacity style={s.addExBtn} onPress={() => addExercise(di)}>
                  <Ionicons name="add" size={14} color={colors.yellow} />
                  <Text style={s.addExText}>Adicionar exercício</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={s.addDayBtn} onPress={addDay}>
              <Ionicons name="add" size={16} color={colors.subtext} />
              <Text style={s.addDayText}>Adicionar divisão</Text>
            </TouchableOpacity>

            <View style={s.builderActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setBuilding(false); setTemplateId(null) }}>
                <Text style={s.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#0A0A0A" size="small" />
                  : <Text style={s.saveBtnText}>Salvar Treino</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Saved workouts */}
        {workouts.length === 0 && !building ? (
          <View style={s.empty}>
            <Ionicons name="barbell-outline" size={40} color={colors.subtext} />
            <Text style={s.emptyText}>Nenhum treino cadastrado.</Text>
            <TouchableOpacity style={s.newBtn} onPress={() => setBuilding(true)}>
              <Ionicons name="add" size={18} color="#0A0A0A" />
              <Text style={s.newBtnText}>Criar Treino</Text>
            </TouchableOpacity>
          </View>
        ) : (
          workouts.map(w => (
            <View key={w.id} style={[s.workoutCard, w.active && s.workoutCardActive]}>
              <View style={s.workoutHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.workoutName}>{w.name}</Text>
                  <Text style={s.workoutDates}>
                    {new Date(w.valid_from).toLocaleDateString('pt-BR')} → {new Date(w.valid_to).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                {w.active && <View style={s.activeBadge}><Text style={s.activeBadgeText}>ATIVO</Text></View>}
              </View>
              {w.days.map(d => (
                <View key={d.id} style={s.dayPreview}>
                  <Text style={s.dayPreviewName}>{d.name}</Text>
                  {d.exercises.slice(0, 4).map(e => (
                    <Text key={e.id} style={s.dayPreviewEx}>
                      · {(e.exercise as any)?.name} — {e.sets}x{e.reps}
                    </Text>
                  ))}
                  {d.exercises.length > 4 && (
                    <Text style={s.dayPreviewMore}>+{d.exercises.length - 4} mais</Text>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Template picker modal */}
      <Modal visible={templateModal} animationType="slide" transparent>
        <View style={s.modal}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Selecionar Template</Text>
              <TouchableOpacity onPress={() => setTemplateModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {loadingTemplates ? (
              <ActivityIndicator color={colors.yellow} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={templates}
                keyExtractor={t => t.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.exerciseResult} onPress={() => applyTemplate(item)}>
                    <Text style={s.exerciseResultName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={s.exerciseResultMuscle}>{item.description}</Text>
                    ) : null}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={s.modalEmpty}>Nenhum template disponível.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Exercise search modal */}
      <Modal visible={searchModal} animationType="slide" transparent>
        <View style={s.modal}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Buscar Exercício</Text>
              <TouchableOpacity onPress={() => setSearchModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color={colors.subtext} />
              <TextInput style={s.searchInput} value={searchQuery} onChangeText={searchExercises}
                placeholder="Nome do exercício..." placeholderTextColor={colors.subtext} autoFocus />
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={e => e.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.exerciseResult} onPress={() => selectExercise(item)}>
                  <Text style={s.exerciseResultName}>{item.name}</Text>
                  {item.muscle_groups?.length > 0 && (
                    <Text style={s.exerciseResultMuscle}>{item.muscle_groups.join(', ')}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length >= 2
                  ? <Text style={s.modalEmpty}>Nenhum exercício encontrado.</Text>
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
  // Builder
  builderCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  builderTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  tplBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.yellow + '60', backgroundColor: colors.yellow + '15' },
  tplBtnText: { fontSize: 12, color: colors.yellow, fontWeight: '600' },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
  },
  row: { flexDirection: 'row', gap: 10 },
  // Day card
  dayCard: { backgroundColor: colors.dark, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: { padding: 8 },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  wdChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  wdChipActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  wdText: { fontSize: 10, fontWeight: '700', color: colors.subtext },
  wdTextActive: { color: '#0A0A0A' },
  // Exercise row
  exRow: { backgroundColor: colors.card, borderRadius: 10, padding: 10, gap: 6 },
  exName: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.border + '50', borderRadius: 8, padding: 10 },
  exNameText: { fontSize: 13, color: colors.text, flex: 1 },
  exNamePlaceholder: { fontSize: 13, color: colors.subtext, flex: 1 },
  exParams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exParam: { flex: 1, gap: 2 },
  exParamLabel: { fontSize: 9, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  exParamInput: {
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: colors.text, textAlign: 'center',
  },
  addExBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addExText: { fontSize: 12, color: colors.yellow, fontWeight: '600' },
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
  // Saved workouts
  workoutCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  workoutCardActive: { borderColor: colors.yellow + '50' },
  workoutHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  workoutName: { fontSize: 15, fontWeight: '700', color: colors.text },
  workoutDates: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  activeBadge: { backgroundColor: colors.yellow + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.yellow + '40' },
  activeBadgeText: { fontSize: 9, fontWeight: '900', color: colors.yellow, letterSpacing: 1 },
  dayPreview: { backgroundColor: colors.dark, borderRadius: 8, padding: 10, gap: 3 },
  dayPreviewName: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  dayPreviewEx: { fontSize: 11, color: colors.subtext },
  dayPreviewMore: { fontSize: 10, color: colors.muted, fontStyle: 'italic' },
  // Modal
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  exerciseResult: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseResultName: { fontSize: 14, fontWeight: '600', color: colors.text },
  exerciseResultMuscle: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  modalEmpty: { color: colors.subtext, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  muted: colors.muted,
})
