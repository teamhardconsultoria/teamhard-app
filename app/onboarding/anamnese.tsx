import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

const TOTAL_STEPS = 6

function maskBirthDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function birthDateToISO(formatted: string): string | null {
  const parts = formatted.split('/')
  if (parts.length !== 3 || parts[2].length !== 4) return null
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export default function AnamneseScreen() {
  const { user, setUser } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [data, setData] = useState({
    // Bloco A
    full_name: user?.name || '',
    birth_date: '',
    biological_sex: '',
    city: '',
    country: 'Brasil',
    profession: '',
    // Bloco B
    goal: '',
    current_weight: '',
    height: '',
    desired_weight: '',
    goal_months: '',
    // Bloco C
    has_disease: false,
    disease_description: '',
    uses_medication: false,
    medication_description: '',
    has_injury: false,
    injury_description: '',
    has_limitation: false,
    limitation_description: '',
    is_pregnant: false,
    // Bloco D
    has_allergy: false,
    allergy_description: '',
    food_restrictions: '',
    meals_per_day: '3',
    water_liters: '2',
    alcohol_consumption: 'none',
    // Bloco E
    sleep_hours: '7',
    stress_level: '2',
    work_type: 'sedentary',
    has_busy_routine: false,
    preferred_workout_time: 'morning',
    // Bloco F
    gym_experience: 'never',
    practices_sport: false,
    sport_description: '',
    fitness_level: 'beginner',
  })

  const set = (key: string, value: any) => setData(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    const loadExisting = async () => {
      const { data: studentData } = await supabase
        .from('students').select('id').eq('user_id', user!.id).single()
      if (!studentData) return

      const { data: ex } = await supabase
        .from('anamnese').select('*').eq('student_id', studentData.id).maybeSingle()
      if (!ex) return

      setData(prev => ({
        ...prev,
        full_name: ex.full_name || prev.full_name,
        birth_date: ex.birth_date
          ? (() => { const [y, m, d] = ex.birth_date.split('-'); return `${d}/${m}/${y}` })()
          : prev.birth_date,
        biological_sex: ex.biological_sex || prev.biological_sex,
        city: ex.city || prev.city,
        country: ex.country || prev.country,
        profession: ex.profession || prev.profession,
        goal: ex.goal || prev.goal,
        current_weight: ex.current_weight != null ? String(ex.current_weight) : prev.current_weight,
        height: ex.height != null ? String(ex.height) : prev.height,
        desired_weight: ex.desired_weight != null ? String(ex.desired_weight) : prev.desired_weight,
        goal_months: ex.goal_months != null ? String(ex.goal_months) : prev.goal_months,
        has_disease: ex.has_disease ?? prev.has_disease,
        disease_description: ex.disease_description || prev.disease_description,
        uses_medication: ex.uses_medication ?? prev.uses_medication,
        medication_description: ex.medication_description || prev.medication_description,
        has_injury: ex.has_injury ?? prev.has_injury,
        injury_description: ex.injury_description || prev.injury_description,
        has_limitation: ex.has_limitation ?? prev.has_limitation,
        limitation_description: ex.limitation_description || prev.limitation_description,
        is_pregnant: ex.is_pregnant ?? prev.is_pregnant,
        has_allergy: ex.has_allergy ?? prev.has_allergy,
        allergy_description: ex.allergy_description || prev.allergy_description,
        food_restrictions: ex.food_restrictions || prev.food_restrictions,
        meals_per_day: ex.meals_per_day != null ? String(ex.meals_per_day) : prev.meals_per_day,
        water_liters: ex.water_liters != null ? String(ex.water_liters) : prev.water_liters,
        alcohol_consumption: ex.alcohol_consumption || prev.alcohol_consumption,
        sleep_hours: ex.sleep_hours != null ? String(ex.sleep_hours) : prev.sleep_hours,
        stress_level: ex.stress_level != null ? String(ex.stress_level) : prev.stress_level,
        work_type: ex.work_type || prev.work_type,
        has_busy_routine: ex.has_busy_routine ?? prev.has_busy_routine,
        preferred_workout_time: ex.preferred_workout_time || prev.preferred_workout_time,
        gym_experience: ex.gym_experience || prev.gym_experience,
        practices_sport: ex.practices_sport ?? prev.practices_sport,
        sport_description: ex.sport_description || prev.sport_description,
        fitness_level: ex.fitness_level || prev.fitness_level,
      }))
    }
    loadExisting()
  }, [])

  const validate = () => {
    if (step === 1 && (!data.full_name || !data.birth_date || !data.biological_sex)) {
      Alert.alert('Campos obrigatórios', 'Preencha nome, data de nascimento e sexo.')
      return false
    }
    if (step === 2 && (!data.goal || !data.current_weight || !data.height)) {
      Alert.alert('Campos obrigatórios', 'Preencha objetivo, peso e altura.')
      return false
    }
    return true
  }

  const handleNext = () => {
    if (!validate()) return
    if (step < TOTAL_STEPS) setStep(step + 1)
    else handleSubmit()
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user!.id)
        .single()

      if (!studentData) throw new Error('Aluno não encontrado.')

      await supabase.from('anamnese').upsert({
        student_id: studentData.id,
        ...data,
        birth_date: birthDateToISO(data.birth_date) ?? data.birth_date,
        current_weight: parseFloat(data.current_weight),
        height: parseFloat(data.height),
        desired_weight: data.desired_weight ? parseFloat(data.desired_weight) : null,
        goal_months: data.goal_months ? parseInt(data.goal_months) : null,
        meals_per_day: parseInt(data.meals_per_day),
        water_liters: parseFloat(data.water_liters),
        sleep_hours: parseFloat(data.sleep_hours),
        stress_level: parseInt(data.stress_level),
        completed: true,
      })

      await supabase.from('students').update({
        birth_date: birthDateToISO(data.birth_date),
        height: parseFloat(data.height),
        initial_weight: parseFloat(data.current_weight),
      }).eq('id', studentData.id)

      await supabase.from('users').update({ anamnese_completed: true }).eq('id', user!.id)
      setUser({ ...user!, anamnese_completed: true })
      router.replace('/(student)/home')
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      {/* Progress */}
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>Passo {step} de {TOTAL_STEPS}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && <BlocoA data={data} set={set} />}
        {step === 2 && <BlocoB data={data} set={set} />}
        {step === 3 && <BlocoC data={data} set={set} />}
        {step === 4 && <BlocoD data={data} set={set} />}
        {step === 5 && <BlocoE data={data} set={set} />}
        {step === 6 && <BlocoF data={data} set={set} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 24 + insets.bottom }]}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, loading && { opacity: 0.6 }]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0A0A0A" />
            : <Text style={styles.nextText}>{step === TOTAL_STEPS ? 'FINALIZAR' : 'PRÓXIMO'}</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// ─── Bloco A: Dados Pessoais ────────────────────────────────────

function BlocoA({ data, set }: any) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Dados Pessoais</Text>

      <Field label="Nome completo" required>
        <TextInput style={s.input} value={data.full_name} onChangeText={v => set('full_name', v)} placeholder="Seu nome" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="Data de nascimento" required>
        <TextInput
          style={s.input}
          value={data.birth_date}
          onChangeText={v => set('birth_date', maskBirthDate(v))}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.subtext}
          keyboardType="numeric"
          maxLength={10}
        />
      </Field>

      <Field label="Sexo biológico" required>
        <SegmentedControl
          options={[{ label: 'Masculino', value: 'male' }, { label: 'Feminino', value: 'female' }]}
          value={data.biological_sex}
          onChange={v => set('biological_sex', v)}
        />
      </Field>

      <Field label="Cidade">
        <TextInput style={s.input} value={data.city} onChangeText={v => set('city', v)} placeholder="Sua cidade" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="País">
        <TextInput style={s.input} value={data.country} onChangeText={v => set('country', v)} placeholder="Brasil" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="Profissão">
        <TextInput style={s.input} value={data.profession} onChangeText={v => set('profession', v)} placeholder="Ex: Professor, Analista..." placeholderTextColor={colors.subtext} />
      </Field>
    </View>
  )
}

// ─── Bloco B: Objetivo ─────────────────────────────────────────

function BlocoB({ data, set }: any) {
  const goals = [
    { label: 'Emagrecer', value: 'weight_loss' },
    { label: 'Ganhar massa', value: 'muscle_gain' },
    { label: 'Melhorar saúde', value: 'health' },
    { label: 'Performance', value: 'performance' },
    { label: 'Outro', value: 'other' },
  ]
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Objetivo</Text>

      <Field label="Objetivo principal" required>
        <View style={s.optionGrid}>
          {goals.map(g => (
            <TouchableOpacity
              key={g.value}
              style={[s.optionChip, data.goal === g.value && s.optionChipActive]}
              onPress={() => set('goal', g.value)}
            >
              <Text style={[s.optionChipText, data.goal === g.value && s.optionChipTextActive]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="Peso atual (kg)" required>
        <TextInput style={s.input} value={data.current_weight} onChangeText={v => set('current_weight', v)} placeholder="Ex: 75.5" placeholderTextColor={colors.subtext} keyboardType="decimal-pad" />
      </Field>

      <Field label="Altura (cm)" required>
        <TextInput style={s.input} value={data.height} onChangeText={v => set('height', v)} placeholder="Ex: 175" placeholderTextColor={colors.subtext} keyboardType="decimal-pad" />
      </Field>

      <Field label="Peso desejado (kg)">
        <TextInput style={s.input} value={data.desired_weight} onChangeText={v => set('desired_weight', v)} placeholder="Ex: 65" placeholderTextColor={colors.subtext} keyboardType="decimal-pad" />
      </Field>

      <Field label="Prazo esperado (meses)">
        <TextInput style={s.input} value={data.goal_months} onChangeText={v => set('goal_months', v)} placeholder="Ex: 6" placeholderTextColor={colors.subtext} keyboardType="number-pad" />
      </Field>
    </View>
  )
}

// ─── Bloco C: Histórico de Saúde ───────────────────────────────

function BlocoC({ data, set }: any) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Histórico de Saúde</Text>

      <YesNoField
        label="Possui doença pré-existente?"
        value={data.has_disease}
        onChange={v => set('has_disease', v)}
      >
        {data.has_disease && (
          <TextInput style={s.input} value={data.disease_description} onChangeText={v => set('disease_description', v)} placeholder="Quais?" placeholderTextColor={colors.subtext} multiline />
        )}
      </YesNoField>

      <YesNoField
        label="Usa algum medicamento?"
        value={data.uses_medication}
        onChange={v => set('uses_medication', v)}
      >
        {data.uses_medication && (
          <TextInput style={s.input} value={data.medication_description} onChangeText={v => set('medication_description', v)} placeholder="Quais?" placeholderTextColor={colors.subtext} multiline />
        )}
      </YesNoField>

      <YesNoField
        label="Possui lesão ou fez cirurgia?"
        value={data.has_injury}
        onChange={v => set('has_injury', v)}
      >
        {data.has_injury && (
          <TextInput style={s.input} value={data.injury_description} onChangeText={v => set('injury_description', v)} placeholder="Descreva" placeholderTextColor={colors.subtext} multiline />
        )}
      </YesNoField>

      <YesNoField
        label="Possui limitação física?"
        value={data.has_limitation}
        onChange={v => set('has_limitation', v)}
      >
        {data.has_limitation && (
          <TextInput style={s.input} value={data.limitation_description} onChangeText={v => set('limitation_description', v)} placeholder="Descreva" placeholderTextColor={colors.subtext} multiline />
        )}
      </YesNoField>

      {data.biological_sex === 'female' && (
        <YesNoField
          label="Está grávida ou amamentando?"
          value={data.is_pregnant}
          onChange={v => set('is_pregnant', v)}
        />
      )}
    </View>
  )
}

// ─── Bloco D: Alimentação ──────────────────────────────────────

function BlocoD({ data, set }: any) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Alimentação</Text>

      <YesNoField
        label="Possui alergia ou intolerância?"
        value={data.has_allergy}
        onChange={v => set('has_allergy', v)}
      >
        {data.has_allergy && (
          <TextInput style={s.input} value={data.allergy_description} onChangeText={v => set('allergy_description', v)} placeholder="Quais?" placeholderTextColor={colors.subtext} multiline />
        )}
      </YesNoField>

      <Field label="Alimentos que não come">
        <TextInput style={[s.input, { minHeight: 60 }]} value={data.food_restrictions} onChangeText={v => set('food_restrictions', v)} placeholder="Ex: frutos do mar, fígado..." placeholderTextColor={colors.subtext} multiline />
      </Field>

      <Field label="Refeições por dia">
        <TextInput style={s.input} value={data.meals_per_day} onChangeText={v => set('meals_per_day', v)} keyboardType="number-pad" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="Litros de água por dia">
        <TextInput style={s.input} value={data.water_liters} onChangeText={v => set('water_liters', v)} keyboardType="decimal-pad" placeholder="Ex: 2.5" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="Consumo de álcool">
        <SegmentedControl
          options={[
            { label: 'Não', value: 'none' },
            { label: 'Raramente', value: 'rarely' },
            { label: '1-2x/sem', value: '1_2_week' },
            { label: '3+/sem', value: '3_plus_week' },
          ]}
          value={data.alcohol_consumption}
          onChange={v => set('alcohol_consumption', v)}
        />
      </Field>
    </View>
  )
}

// ─── Bloco E: Estilo de Vida ───────────────────────────────────

function BlocoE({ data, set }: any) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Estilo de Vida</Text>

      <Field label="Horas de sono por noite">
        <TextInput style={s.input} value={data.sleep_hours} onChangeText={v => set('sleep_hours', v)} keyboardType="decimal-pad" placeholder="Ex: 7" placeholderTextColor={colors.subtext} />
      </Field>

      <Field label="Nível de estresse (1 = baixo, 5 = muito alto)">
        <SegmentedControl
          options={['1', '2', '3', '4', '5'].map(v => ({ label: v, value: v }))}
          value={data.stress_level}
          onChange={v => set('stress_level', v)}
        />
      </Field>

      <Field label="Tipo de trabalho">
        <SegmentedControl
          options={[
            { label: 'Sedentário', value: 'sedentary' },
            { label: 'Leve', value: 'light' },
            { label: 'Moderado', value: 'moderate' },
            { label: 'Intenso', value: 'intense' },
          ]}
          value={data.work_type}
          onChange={v => set('work_type', v)}
        />
      </Field>

      <YesNoField
        label="Tem filhos ou rotina muito corrida?"
        value={data.has_busy_routine}
        onChange={v => set('has_busy_routine', v)}
      />

      <Field label="Horário preferido para treinar">
        <SegmentedControl
          options={[
            { label: 'Manhã', value: 'morning' },
            { label: 'Tarde', value: 'afternoon' },
            { label: 'Noite', value: 'evening' },
            { label: 'Variável', value: 'variable' },
          ]}
          value={data.preferred_workout_time}
          onChange={v => set('preferred_workout_time', v)}
        />
      </Field>
    </View>
  )
}

// ─── Bloco F: Histórico Fitness ────────────────────────────────

function BlocoF({ data, set }: any) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>Histórico Fitness</Text>

      <Field label="Experiência com musculação">
        <SegmentedControl
          options={[
            { label: 'Nunca', value: 'never' },
            { label: '< 6 meses', value: 'less_6mo' },
            { label: '6m-2a', value: '6mo_2yr' },
            { label: '2+ anos', value: 'more_2yr' },
          ]}
          value={data.gym_experience}
          onChange={v => set('gym_experience', v)}
        />
      </Field>

      <YesNoField
        label="Pratica ou praticou algum esporte?"
        value={data.practices_sport}
        onChange={v => set('practices_sport', v)}
      >
        {data.practices_sport && (
          <TextInput style={s.input} value={data.sport_description} onChangeText={v => set('sport_description', v)} placeholder="Qual(is)?" placeholderTextColor={colors.subtext} />
        )}
      </YesNoField>

      <Field label="Nível de experiência">
        <SegmentedControl
          options={[
            { label: 'Iniciante', value: 'beginner' },
            { label: 'Intermediário', value: 'intermediate' },
            { label: 'Avançado', value: 'advanced' },
          ]}
          value={data.fitness_level}
          onChange={v => set('fitness_level', v)}
        />
      </Field>
    </View>
  )
}

// ─── Componentes utilitários ────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {required && <Text style={{ color: colors.yellow }}> *</Text>}
      </Text>
      {children}
    </View>
  )
}

function YesNoField({ label, value, onChange, children }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <SegmentedControl
        options={[{ label: 'Não', value: false }, { label: 'Sim', value: true }]}
        value={value}
        onChange={onChange}
      />
      {children}
    </View>
  )
}

function SegmentedControl({ options, value, onChange }: { options: { label: string; value: any }[]; value: any; onChange: (v: any) => void }) {
  return (
    <View style={s.segmented}>
      {options.map(opt => (
        <TouchableOpacity
          key={String(opt.value)}
          style={[s.segment, value === opt.value && s.segmentActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[s.segmentText, value === opt.value && s.segmentTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  progressWrap: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16, gap: 8 },
  progressLabel: { fontSize: 12, color: colors.subtext, letterSpacing: 1, textTransform: 'uppercase' },
  progressBar: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: colors.yellow, borderRadius: 2 },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.dark,
  },
  backBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  backText: { fontSize: 15, color: colors.subtext, fontWeight: '600' },
  nextBtn: {
    flex: 2,
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
})

const s = StyleSheet.create({
  block: { gap: 20 },
  blockTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  field: { gap: 8 },
  label: { fontSize: 13, color: colors.subtext, fontWeight: '500' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.yellow },
  segmentText: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  segmentTextActive: { color: '#0A0A0A' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionChipActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  optionChipText: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  optionChipTextActive: { color: '#0A0A0A' },
})
