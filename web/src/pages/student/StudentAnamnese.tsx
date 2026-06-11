import { useEffect, useState } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface AnamneseForm {
  full_name: string; birth_date: string; biological_sex: string; city: string; profession: string
  goal: string; current_weight: string; height: string; desired_weight: string; goal_months: string; fitness_level: string
  has_disease: boolean; disease_description: string
  uses_medication: boolean; medication_description: string
  has_injury: boolean; injury_description: string
  has_limitation: boolean; limitation_description: string
  is_pregnant: boolean
  has_allergy: boolean; allergy_description: string
  food_restrictions: string; meals_per_day: string; water_liters: string; alcohol_consumption: string
  sleep_hours: string; stress_level: string; work_type: string; has_busy_routine: boolean; preferred_workout_time: string
  gym_experience: string; practices_sport: boolean; sport_description: string
}

const EMPTY: AnamneseForm = {
  full_name: '', birth_date: '', biological_sex: '', city: '', profession: '',
  goal: '', current_weight: '', height: '', desired_weight: '', goal_months: '', fitness_level: '',
  has_disease: false, disease_description: '',
  uses_medication: false, medication_description: '',
  has_injury: false, injury_description: '',
  has_limitation: false, limitation_description: '',
  is_pregnant: false,
  has_allergy: false, allergy_description: '',
  food_restrictions: '', meals_per_day: '', water_liters: '', alcohol_consumption: '',
  sleep_hours: '', stress_level: '', work_type: '', has_busy_routine: false, preferred_workout_time: '',
  gym_experience: '', practices_sport: false, sport_description: '',
}

const ACTIVITY_FACTOR: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, intense: 1.725,
}

function calcTMB(f: AnamneseForm) {
  const w = parseFloat(f.current_weight), h = parseFloat(f.height), bd = f.birth_date
  if (!w || !h || !bd) return null
  const age = Math.floor((Date.now() - new Date(bd).getTime()) / (365.25 * 24 * 3600 * 1000))
  if (f.biological_sex === 'male') return 10 * w + 6.25 * h - 5 * age + 5
  if (f.biological_sex === 'female') return 10 * w + 6.25 * h - 5 * age - 161
  return null
}

const spin = { width: 28, height: 28, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

const STEPS = ['Dados Pessoais', 'Objetivo', 'Saúde', 'Alimentação', 'Estilo de Vida']

export default function StudentAnamnese() {
  const { user } = useAuthStore()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<AnamneseForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)
    const { data: existing } = await supabase.from('anamnese').select('*').eq('student_id', student.id).maybeSingle()
    if (existing) {
      setForm({
        full_name: existing.full_name || '',
        birth_date: existing.birth_date || '',
        biological_sex: existing.biological_sex || '',
        city: existing.city || '',
        profession: existing.profession || '',
        goal: existing.goal || '',
        current_weight: existing.current_weight != null ? String(existing.current_weight) : '',
        height: existing.height != null ? String(existing.height) : '',
        desired_weight: existing.desired_weight != null ? String(existing.desired_weight) : '',
        goal_months: existing.goal_months != null ? String(existing.goal_months) : '',
        fitness_level: existing.fitness_level || '',
        has_disease: !!existing.has_disease,
        disease_description: existing.disease_description || '',
        uses_medication: !!existing.uses_medication,
        medication_description: existing.medication_description || '',
        has_injury: !!existing.has_injury,
        injury_description: existing.injury_description || '',
        has_limitation: !!existing.has_limitation,
        limitation_description: existing.limitation_description || '',
        is_pregnant: !!existing.is_pregnant,
        has_allergy: !!existing.has_allergy,
        allergy_description: existing.allergy_description || '',
        food_restrictions: existing.food_restrictions || '',
        meals_per_day: existing.meals_per_day != null ? String(existing.meals_per_day) : '',
        water_liters: existing.water_liters != null ? String(existing.water_liters) : '',
        alcohol_consumption: existing.alcohol_consumption || '',
        sleep_hours: existing.sleep_hours != null ? String(existing.sleep_hours) : '',
        stress_level: existing.stress_level != null ? String(existing.stress_level) : '',
        work_type: existing.work_type || '',
        has_busy_routine: !!existing.has_busy_routine,
        preferred_workout_time: existing.preferred_workout_time || '',
        gym_experience: existing.gym_experience || '',
        practices_sport: !!existing.practices_sport,
        sport_description: existing.sport_description || '',
      })
      if (existing.completed) setSaved(true)
    }
    setLoading(false)
  }

  const set = (k: keyof AnamneseForm, v: any) => setForm(p => ({ ...p, [k]: v }))

  const validate = () => {
    if (step === 0 && (!form.full_name || !form.birth_date || !form.biological_sex)) return 'Preencha nome, data de nascimento e sexo.'
    if (step === 1 && (!form.goal || !form.current_weight || !form.height)) return 'Preencha objetivo, peso e altura.'
    return ''
  }

  const next = () => {
    const err = validate(); if (err) { setError(err); return }
    setError(''); setStep(s => s + 1)
  }

  const back = () => { setError(''); setStep(s => s - 1) }

  const submit = async () => {
    const err = validate(); if (err) { setError(err); return }
    if (!studentId) return
    setSaving(true); setError('')
    const tmb = calcTMB(form)
    const get_value = tmb && form.work_type ? tmb * (ACTIVITY_FACTOR[form.work_type] || 1.2) : null
    const payload = {
      student_id: studentId,
      full_name: form.full_name || null,
      birth_date: form.birth_date || null,
      biological_sex: form.biological_sex || null,
      city: form.city || null,
      profession: form.profession || null,
      goal: form.goal || null,
      current_weight: form.current_weight ? parseFloat(form.current_weight) : null,
      height: form.height ? parseFloat(form.height) : null,
      desired_weight: form.desired_weight ? parseFloat(form.desired_weight) : null,
      goal_months: form.goal_months ? parseInt(form.goal_months) : null,
      fitness_level: form.fitness_level || null,
      has_disease: form.has_disease,
      disease_description: form.has_disease ? form.disease_description || null : null,
      uses_medication: form.uses_medication,
      medication_description: form.uses_medication ? form.medication_description || null : null,
      has_injury: form.has_injury,
      injury_description: form.has_injury ? form.injury_description || null : null,
      has_limitation: form.has_limitation,
      limitation_description: form.has_limitation ? form.limitation_description || null : null,
      is_pregnant: form.biological_sex === 'female' ? form.is_pregnant : false,
      has_allergy: form.has_allergy,
      allergy_description: form.has_allergy ? form.allergy_description || null : null,
      food_restrictions: form.food_restrictions || null,
      meals_per_day: form.meals_per_day ? parseInt(form.meals_per_day) : null,
      water_liters: form.water_liters ? parseFloat(form.water_liters) : null,
      alcohol_consumption: form.alcohol_consumption || null,
      sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
      stress_level: form.stress_level ? parseInt(form.stress_level) : null,
      work_type: form.work_type || null,
      has_busy_routine: form.has_busy_routine,
      preferred_workout_time: form.preferred_workout_time || null,
      gym_experience: form.gym_experience || null,
      practices_sport: form.practices_sport,
      sport_description: form.practices_sport ? form.sport_description || null : null,
      tmb: tmb ?? null,
      get_value: get_value ?? null,
      completed: true,
    }
    const { error: upsertErr } = await supabase.from('anamnese').upsert(payload, { onConflict: 'student_id' })
    if (upsertErr) { setError(upsertErr.message); setSaving(false); return }
    setSaved(true); setSaving(false)
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  if (saved) return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: '20px 16px 48px', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', padding: '48px 0 32px' }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={32} color="#0A0A0A" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 8px' }}>Anamnese enviada!</h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Seu coach já pode visualizar suas informações.</p>
        </div>
        <button onClick={() => setSaved(false)}
          style={{ width: '100%', padding: '13px', borderRadius: 12, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Editar respostas
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header com progresso */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {step > 0 && (
            <button onClick={back} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 4px' }}>Etapa {step + 1} de {STEPS.length}</p>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{STEPS[step]}</p>
          </div>
        </div>
        {/* Barra de progresso */}
        <div style={{ height: 3, backgroundColor: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', backgroundColor: '#E8FF00', borderRadius: 2, width: `${((step + 1) / STEPS.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Conteúdo da etapa */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 8px' }}>
        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {step === 0 && <Step0 form={form} set={set} />}
          {step === 1 && <Step1 form={form} set={set} />}
          {step === 2 && <Step2 form={form} set={set} />}
          {step === 3 && <Step3 form={form} set={set} />}
          {step === 4 && <Step4 form={form} set={set} />}
          {error && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{error}</p>}
        </div>
      </div>

      {/* Botão de ação */}
      <div style={{ padding: '12px 16px', paddingBottom: 'max(16px,env(safe-area-inset-bottom,16px))', borderTop: '1px solid var(--border)', flexShrink: 0, backgroundColor: 'var(--bg)' }}>
        {step < STEPS.length - 1 ? (
          <button onClick={next}
            style={{ width: '100%', padding: '14px', borderRadius: 12, backgroundColor: '#E8FF00', border: 'none', color: '#0A0A0A', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            Próximo
          </button>
        ) : (
          <button onClick={submit} disabled={saving}
            style={{ width: '100%', padding: '14px', borderRadius: 12, backgroundColor: saving ? 'var(--border)' : '#E8FF00', border: 'none', color: saving ? 'var(--text-2)' : '#0A0A0A', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Enviando…' : 'Enviar anamnese'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Etapas ──────────────────────────────────────────────────────

function Step0({ form, set }: { form: AnamneseForm; set: (k: keyof AnamneseForm, v: any) => void }) {
  return <>
    <Field label="Nome completo *">
      <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Seu nome completo"
        style={inp} onFocus={focusS} onBlur={blurS} />
    </Field>
    <Field label="Data de nascimento *">
      <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)}
        style={inp} onFocus={focusS} onBlur={blurS} />
    </Field>
    <Field label="Sexo biológico *">
      <OptionRow value={form.biological_sex} onChange={v => set('biological_sex', v)}
        options={[{ value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }]} />
    </Field>
    <Field label="Cidade">
      <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Ex: São Paulo"
        style={inp} onFocus={focusS} onBlur={blurS} />
    </Field>
    <Field label="Profissão">
      <input value={form.profession} onChange={e => set('profession', e.target.value)} placeholder="Ex: Professora"
        style={inp} onFocus={focusS} onBlur={blurS} />
    </Field>
  </>
}

function Step1({ form, set }: { form: AnamneseForm; set: (k: keyof AnamneseForm, v: any) => void }) {
  return <>
    <Field label="Objetivo principal *">
      <OptionGrid value={form.goal} onChange={v => set('goal', v)} options={[
        { value: 'weight_loss', label: 'Emagrecimento' },
        { value: 'muscle_gain', label: 'Ganho de massa' },
        { value: 'health', label: 'Saúde' },
        { value: 'performance', label: 'Performance' },
        { value: 'other', label: 'Outro' },
      ]} />
    </Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Peso atual (kg) *">
        <input type="number" value={form.current_weight} onChange={e => set('current_weight', e.target.value)}
          placeholder="Ex: 72.5" step="0.1" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
      <Field label="Altura (cm) *">
        <input type="number" value={form.height} onChange={e => set('height', e.target.value)}
          placeholder="Ex: 165" step="1" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Peso desejado (kg)">
        <input type="number" value={form.desired_weight} onChange={e => set('desired_weight', e.target.value)}
          placeholder="Ex: 65" step="0.1" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
      <Field label="Prazo (meses)">
        <input type="number" value={form.goal_months} onChange={e => set('goal_months', e.target.value)}
          placeholder="Ex: 6" step="1" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
    </div>
    <Field label="Nível de condicionamento">
      <OptionGrid value={form.fitness_level} onChange={v => set('fitness_level', v)} options={[
        { value: 'beginner', label: 'Iniciante' },
        { value: 'intermediate', label: 'Intermediário' },
        { value: 'advanced', label: 'Avançado' },
      ]} />
    </Field>
  </>
}

function Step2({ form, set }: { form: AnamneseForm; set: (k: keyof AnamneseForm, v: any) => void }) {
  return <>
    <ToggleField label="Possui alguma doença diagnosticada?" value={form.has_disease} onChange={v => set('has_disease', v)}>
      {form.has_disease && <textarea value={form.disease_description} onChange={e => set('disease_description', e.target.value)}
        placeholder="Qual(is)?" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
    <ToggleField label="Usa algum medicamento?" value={form.uses_medication} onChange={v => set('uses_medication', v)}>
      {form.uses_medication && <textarea value={form.medication_description} onChange={e => set('medication_description', e.target.value)}
        placeholder="Qual(is)?" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
    <ToggleField label="Tem alguma lesão?" value={form.has_injury} onChange={v => set('has_injury', v)}>
      {form.has_injury && <textarea value={form.injury_description} onChange={e => set('injury_description', e.target.value)}
        placeholder="Descreva a lesão" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
    <ToggleField label="Tem limitação física?" value={form.has_limitation} onChange={v => set('has_limitation', v)}>
      {form.has_limitation && <textarea value={form.limitation_description} onChange={e => set('limitation_description', e.target.value)}
        placeholder="Descreva a limitação" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
    {form.biological_sex === 'female' && (
      <ToggleField label="Está gestante?" value={form.is_pregnant} onChange={v => set('is_pregnant', v)} />
    )}
  </>
}

function Step3({ form, set }: { form: AnamneseForm; set: (k: keyof AnamneseForm, v: any) => void }) {
  return <>
    <ToggleField label="Tem alguma alergia alimentar?" value={form.has_allergy} onChange={v => set('has_allergy', v)}>
      {form.has_allergy && <input value={form.allergy_description} onChange={e => set('allergy_description', e.target.value)}
        placeholder="Qual(is)?" style={inp} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
    <Field label="Restrições alimentares">
      <input value={form.food_restrictions} onChange={e => set('food_restrictions', e.target.value)}
        placeholder="Ex: vegetariano, sem glúten…" style={inp} onFocus={focusS} onBlur={blurS} />
    </Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Refeições por dia">
        <input type="number" value={form.meals_per_day} onChange={e => set('meals_per_day', e.target.value)}
          placeholder="Ex: 5" step="1" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
      <Field label="Água (litros/dia)">
        <input type="number" value={form.water_liters} onChange={e => set('water_liters', e.target.value)}
          placeholder="Ex: 2.0" step="0.5" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
    </div>
    <Field label="Consumo de álcool">
      <OptionGrid value={form.alcohol_consumption} onChange={v => set('alcohol_consumption', v)} options={[
        { value: 'none', label: 'Não consome' },
        { value: 'rarely', label: 'Raramente' },
        { value: '1_2_week', label: '1–2x/semana' },
        { value: '3_plus_week', label: '3+ vezes/sem' },
      ]} />
    </Field>
  </>
}

function Step4({ form, set }: { form: AnamneseForm; set: (k: keyof AnamneseForm, v: any) => void }) {
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Horas de sono">
        <input type="number" value={form.sleep_hours} onChange={e => set('sleep_hours', e.target.value)}
          placeholder="Ex: 7" step="0.5" style={inp} onFocus={focusS} onBlur={blurS} />
      </Field>
      <Field label="Nível de estresse (1–5)">
        <OptionRow value={form.stress_level} onChange={v => set('stress_level', v)}
          options={['1','2','3','4','5'].map(v => ({ value: v, label: v }))} />
      </Field>
    </div>
    <Field label="Tipo de trabalho">
      <OptionGrid value={form.work_type} onChange={v => set('work_type', v)} options={[
        { value: 'sedentary', label: 'Sedentário' },
        { value: 'light', label: 'Leve' },
        { value: 'moderate', label: 'Moderado' },
        { value: 'intense', label: 'Intenso' },
      ]} />
    </Field>
    <ToggleField label="Tem rotina corrida?" value={form.has_busy_routine} onChange={v => set('has_busy_routine', v)} />
    <Field label="Horário preferido para treinar">
      <OptionGrid value={form.preferred_workout_time} onChange={v => set('preferred_workout_time', v)} options={[
        { value: 'morning', label: 'Manhã' },
        { value: 'afternoon', label: 'Tarde' },
        { value: 'evening', label: 'Noite' },
        { value: 'variable', label: 'Variável' },
      ]} />
    </Field>
    <Field label="Experiência com academia">
      <OptionGrid value={form.gym_experience} onChange={v => set('gym_experience', v)} options={[
        { value: 'never', label: 'Nunca treinou' },
        { value: 'less_6mo', label: '< 6 meses' },
        { value: '6mo_2yr', label: '6 meses – 2 anos' },
        { value: 'more_2yr', label: '> 2 anos' },
      ]} />
    </Field>
    <ToggleField label="Pratica algum esporte?" value={form.practices_sport} onChange={v => set('practices_sport', v)}>
      {form.practices_sport && <input value={form.sport_description} onChange={e => set('sport_description', e.target.value)}
        placeholder="Qual esporte?" style={inp} onFocus={focusS} onBlur={blurS} />}
    </ToggleField>
  </>
}

// ─── Componentes auxiliares ──────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{label}</label>
      {children}
    </div>
  )
}

function ToggleField({ label, value, onChange, children }: { label: string; value: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
        <div onClick={() => onChange(!value)}
          style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: value ? '#E8FF00' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: 10, backgroundColor: value ? '#0A0A0A' : 'var(--text-2)', transition: 'left 0.2s' }} />
        </div>
      </div>
      {children && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  )
}

function OptionRow({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(o => {
        const sel = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? 'rgba(232,255,0,0.1)' : 'var(--bg)', color: sel ? '#E8FF00' : 'var(--text)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function OptionGrid({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, 1fr)`, gap: 8 }}>
      {options.map(o => {
        const sel = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ padding: '10px 8px', borderRadius: 10, border: `1px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? 'rgba(232,255,0,0.1)' : 'var(--bg)', color: sel ? '#E8FF00' : 'var(--text)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer', textAlign: 'center' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const focusS = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = '#E8FF00' }
const blurS = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }
