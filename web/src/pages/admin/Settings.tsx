import { useEffect, useState } from 'react'
import { Settings2, ShieldAlert, CalendarClock, Save, Check, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface GlobalSettings {
  assessment_frequency_weeks: number
  assessment_warning_days: number
  payment_tolerance_days: number
  updated_at: string | null
  updated_by: string | null
}

const defaults: GlobalSettings = {
  assessment_frequency_weeks: 8,
  assessment_warning_days: 7,
  payment_tolerance_days: 3,
  updated_at: null,
  updated_by: null,
}

const spin = { width: 24, height: 24, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

const ACTIVITY_FACTORS = [
  { label: 'Sedentário',      desc: 'Pouco ou nenhum exercício',            value: 1.2   },
  { label: 'Leve',            desc: 'Exercício leve 1–3 dias/semana',       value: 1.375 },
  { label: 'Moderado',        desc: 'Exercício moderado 3–5 dias/semana',   value: 1.55  },
  { label: 'Intenso',         desc: 'Exercício intenso 6–7 dias/semana',    value: 1.725 },
  { label: 'Muito intenso',   desc: 'Atleta profissional ou trabalho físico', value: 1.9 },
]

export default function Settings() {
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<GlobalSettings>(defaults)
  const [form, setForm] = useState<GlobalSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [updatedByName, setUpdatedByName] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase.from('global_settings').select('*').eq('id', 1).single()
    if (data) {
      const s = { ...defaults, ...data }
      setSettings(s)
      setForm(s)
      if (data.updated_by) {
        const { data: u } = await supabase.from('users').select('name').eq('id', data.updated_by).single()
        setUpdatedByName(u?.name || null)
      }
    }
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('global_settings').update({
      assessment_frequency_weeks: form.assessment_frequency_weeks,
      assessment_warning_days:    form.assessment_warning_days,
      payment_tolerance_days:     form.payment_tolerance_days,
      updated_at:                 new Date().toISOString(),
      updated_by:                 user!.id,
    }).eq('id', 1)

    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return }

    setSettings(form)
    setUpdatedByName(user?.name || null)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const changed =
    form.assessment_frequency_weeks !== settings.assessment_frequency_weeks ||
    form.assessment_warning_days    !== settings.assessment_warning_days    ||
    form.payment_tolerance_days     !== settings.payment_tolerance_days

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 680 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Configurações Globais</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0 0' }}>
              Parâmetros padrão aplicados a todos os coaches e alunos da plataforma.
            </p>
          </div>
          {settings.updated_at && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', margin: 0, flexShrink: 0 }}>
              Atualizado em {new Date(settings.updated_at).toLocaleDateString('pt-BR')}<br />
              {updatedByName && <span>por {updatedByName}</span>}
            </p>
          )}
        </div>

        {/* Seção: Avaliações */}
        <Section icon={<CalendarClock size={16} color="#E8FF00" />} title="Avaliações">
          <Field
            label="Frequência padrão"
            hint="A cada quantas semanas o aluno deve enviar uma nova avaliação."
          >
            <NumberInput
              value={form.assessment_frequency_weeks}
              min={1} max={52}
              onChange={v => setForm(p => ({ ...p, assessment_frequency_weeks: v }))}
              suffix="semanas"
            />
            <Presets
              values={[4, 8, 12]}
              current={form.assessment_frequency_weeks}
              labels={['4 sem.', '8 sem.', '12 sem.']}
              onSelect={v => setForm(p => ({ ...p, assessment_frequency_weeks: v }))}
            />
          </Field>

          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />

          <Field
            label="Aviso de avaliação vencendo"
            hint="Quantos dias antes o coach recebe notificação de avaliação chegando."
          >
            <NumberInput
              value={form.assessment_warning_days}
              min={1} max={30}
              onChange={v => setForm(p => ({ ...p, assessment_warning_days: v }))}
              suffix="dias antes"
            />
            <Presets
              values={[3, 7, 14]}
              current={form.assessment_warning_days}
              labels={['3 dias', '7 dias', '14 dias']}
              onSelect={v => setForm(p => ({ ...p, assessment_warning_days: v }))}
            />
          </Field>
        </Section>

        {/* Seção: Pagamentos */}
        <Section icon={<ShieldAlert size={16} color="#E8FF00" />} title="Pagamentos">
          <Field
            label="Tolerância de inadimplência"
            hint="Após quantos dias de atraso o acesso do aluno é bloqueado automaticamente."
          >
            <NumberInput
              value={form.payment_tolerance_days}
              min={0} max={30}
              onChange={v => setForm(p => ({ ...p, payment_tolerance_days: v }))}
              suffix="dias"
            />
            <Presets
              values={[1, 3, 7]}
              current={form.payment_tolerance_days}
              labels={['1 dia', '3 dias', '7 dias']}
              onSelect={v => setForm(p => ({ ...p, payment_tolerance_days: v }))}
            />
          </Field>
        </Section>

        {/* Seção: Fatores de Atividade (referência) */}
        <Section icon={<Settings2 size={16} color="#E8FF00" />} title="Fatores de Atividade (GET)">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(232,255,0,0.05)', border: '1px solid rgba(232,255,0,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <Info size={14} color="#E8FF00" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              Os fatores abaixo são usados no cálculo automático de GET (Gasto Energético Total) via fórmula Mifflin-St Jeor.
              O fator de cada aluno é definido individualmente pelo coach na anamnese.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ACTIVITY_FACTORS.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{f.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{f.desc}</p>
                </div>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#E8FF00', fontVariantNumeric: 'tabular-nums' }}>×{f.value}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Botão salvar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={save}
            disabled={!changed || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, cursor: !changed || saving ? 'not-allowed' : 'pointer',
              backgroundColor: saved ? '#00C853' : changed ? '#E8FF00' : 'var(--border)',
              color: saved ? '#fff' : changed ? '#0A0A0A' : 'var(--text-2)',
              opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
            }}
          >
            {saved ? <><Check size={16} /> Salvo!</> : saving ? 'Salvando…' : <><Save size={16} /> Salvar alterações</>}
          </button>
        </div>

      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(232,255,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{hint}</p>
      </div>
      {children}
    </div>
  )
}

function NumberInput({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: 20, cursor: value <= min ? 'not-allowed' : 'pointer', opacity: value <= min ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        −
      </button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'center' }}>{value}</span>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{suffix}</span>
      </div>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: 20, cursor: value >= max ? 'not-allowed' : 'pointer', opacity: value >= max ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        +
      </button>
    </div>
  )
}

function Presets({ values, labels, current, onSelect }: { values: number[]; labels: string[]; current: number; onSelect: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {values.map((v, i) => (
        <button key={v} onClick={() => onSelect(v)}
          style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${current === v ? '#E8FF00' : 'var(--border)'}`, backgroundColor: current === v ? 'rgba(232,255,0,0.12)' : 'transparent', color: current === v ? '#E8FF00' : 'var(--text-2)', transition: 'all 0.15s' }}>
          {labels[i]}
        </button>
      ))}
    </div>
  )
}
