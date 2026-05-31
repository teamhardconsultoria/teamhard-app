import { useEffect, useState } from 'react'
import { Save, Check, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { AutoMessageType } from '../../lib/autoMessage'

type AllTemplateType = 'welcome' | 'anamnese_reminder' | AutoMessageType

const DEFAULTS: Record<AllTemplateType, string> = {
  welcome: 'Olá, {student_name}! 👋 Seja bem-vindo(a) ao Team Hard! Estou aqui para te ajudar a alcançar seus objetivos. Qualquer dúvida é só me chamar aqui no chat. Bora juntos! 💪',
  anamnese_reminder: 'Olá, {student_name}! 📋 Para começarmos bem, preencha sua anamnese e envie sua avaliação física inicial pelo app. Essas informações são essenciais para eu montar o plano ideal para você. Qualquer dúvida, é só chamar! 💪',
  workout_assigned: 'Olá, {student_name}! 💪 Seu novo treino já está disponível no app. Acesse agora e bora treinar!',
  diet_assigned: 'Olá, {student_name}! 🥗 Sua nova dieta já está disponível no app. Qualquer dúvida, é só falar!',
  payment_pending: 'Olá, {student_name}! Você tem uma cobrança pendente. Regularize para continuar com acesso ao app. Qualquer dúvida, entre em contato!',
}

const META: Record<AllTemplateType, { title: string; trigger: string; emoji: string }> = {
  welcome: {
    title: 'Boas-vindas',
    trigger: 'Disparada automaticamente quando o aluno faz o primeiro login no app.',
    emoji: '👋',
  },
  anamnese_reminder: {
    title: 'Anamnese e Avaliação',
    trigger: 'Enviada junto com as boas-vindas, orientando o aluno a preencher a anamnese e enviar a avaliação inicial.',
    emoji: '📋',
  },
  workout_assigned: {
    title: 'Treino Atribuído',
    trigger: 'Disparada automaticamente quando você salva um novo treino para o aluno.',
    emoji: '💪',
  },
  diet_assigned: {
    title: 'Dieta Atribuída',
    trigger: 'Disparada automaticamente quando você salva uma nova dieta para o aluno.',
    emoji: '🥗',
  },
  payment_pending: {
    title: 'Pagamento Pendente',
    trigger: 'Disparada automaticamente quando você cria uma cobrança para o aluno.',
    emoji: '💳',
  },
}

const TYPES: AllTemplateType[] = ['welcome', 'anamnese_reminder', 'workout_assigned', 'diet_assigned', 'payment_pending']

interface TplState { content: string; active: boolean; saving: boolean; saved: boolean }

const defaultState = (): TplState => ({ content: '', active: true, saving: false, saved: false })

const surface: React.CSSProperties = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }

export default function AutoMessages() {
  const { user } = useAuthStore()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Record<AllTemplateType, TplState>>({
    welcome: { ...defaultState(), content: DEFAULTS.welcome },
    anamnese_reminder: { ...defaultState(), content: DEFAULTS.anamnese_reminder },
    workout_assigned: { ...defaultState(), content: DEFAULTS.workout_assigned },
    diet_assigned: { ...defaultState(), content: DEFAULTS.diet_assigned },
    payment_pending: { ...defaultState(), content: DEFAULTS.payment_pending },
  })

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)

    const { data } = await supabase
      .from('message_templates')
      .select('type, content, active')
      .eq('coach_id', coach.id)

    if (data && data.length > 0) {
      setTemplates(prev => {
        const next = { ...prev }
        for (const row of data) {
          if (TYPES.includes(row.type as AllTemplateType)) {
            next[row.type as AllTemplateType] = { ...next[row.type as AllTemplateType], content: row.content, active: row.active }
          }
        }
        return next
      })
    }
    setLoading(false)
  }

  const patch = (type: AllTemplateType, patch: Partial<TplState>) =>
    setTemplates(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }))

  const save = async (type: AllTemplateType) => {
    if (!coachId) return
    patch(type, { saving: true, saved: false })

    await supabase.from('message_templates').upsert({
      coach_id: coachId,
      type,
      content: templates[type].content,
      active: templates[type].active,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'coach_id,type' })

    patch(type, { saving: false, saved: true })
    setTimeout(() => patch(type, { saved: false }), 2000)
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, maxWidth: 720 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Zap size={22} color="#E8FF00" />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Mensagens Automáticas</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 32px 0' }}>
          Configure mensagens que serão enviadas automaticamente no chat quando certos eventos acontecerem.
          Use <code style={{ backgroundColor: 'var(--surface)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{'{student_name}'}</code> para incluir o primeiro nome do aluno.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {TYPES.map(type => {
            const meta = META[type]
            const tpl = templates[type]
            return (
              <div key={type} style={{ ...surface, opacity: tpl.active ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{meta.title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{meta.trigger}</p>
                  </div>

                  {/* Toggle active */}
                  <button
                    onClick={() => patch(type, { active: !tpl.active })}
                    style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: '1px solid var(--border)', cursor: 'pointer',
                      backgroundColor: tpl.active ? '#E8FF00' : 'transparent',
                      color: tpl.active ? '#0A0A0A' : 'var(--text-2)',
                      flexShrink: 0, marginLeft: 16,
                    }}
                  >
                    {tpl.active ? 'Ativo' : 'Inativo'}
                  </button>
                </div>

                {/* Textarea */}
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Mensagem</label>
                  <textarea
                    value={tpl.content}
                    onChange={e => patch(type, { content: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 14px',
                      backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 10, color: 'var(--text)', fontSize: 14,
                      outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    disabled={!tpl.active}
                  />
                </div>

                {/* Save button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => save(type)}
                    disabled={tpl.saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '9px 20px', borderRadius: 8, border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: tpl.saving ? 'not-allowed' : 'pointer',
                      backgroundColor: tpl.saved ? '#00C853' : '#E8FF00',
                      color: '#0A0A0A', transition: 'background-color 0.2s',
                    }}
                  >
                    {tpl.saved ? <Check size={15} /> : <Save size={15} />}
                    {tpl.saving ? 'Salvando…' : tpl.saved ? 'Salvo!' : 'Salvar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
