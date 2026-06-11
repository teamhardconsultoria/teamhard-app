import { useEffect, useState } from 'react'
import { ClipboardList, Check, X, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

type QuestionType = 'text' | 'number' | 'scale' | 'single' | 'multiple' | 'date'
interface Question { id: string; type: QuestionType; text: string; required: boolean; options?: string[] }
interface Assignment {
  id: string
  questionnaire_id: string
  due_date: string | null
  questionnaire: { id: string; title: string; questions: Question[] }
}
interface CompletedItem extends Assignment {
  response: { id: string; answers: Record<string, any>; submitted_at: string }
}

const spin = { width: 28, height: 28, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function StudentQuestionnaires() {
  const { user } = useAuthStore()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [pending, setPending] = useState<Assignment[]>([])
  const [completed, setCompleted] = useState<CompletedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Assignment | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedCompleted, setExpandedCompleted] = useState<Record<string, boolean>>({})

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)

    const [assignRes, respRes] = await Promise.all([
      supabase.from('questionnaire_assignments')
        .select('id, questionnaire_id, due_date, questionnaire:questionnaires(id, title, questions)')
        .eq('student_id', student.id),
      supabase.from('questionnaire_responses')
        .select('id, questionnaire_id, answers, submitted_at')
        .eq('student_id', student.id),
    ])

    const responseMap = new Map((respRes.data || []).map((r: any) => [r.questionnaire_id, r]))
    const assignments = (assignRes.data || []) as Assignment[]

    setPending(assignments.filter(a => !responseMap.has(a.questionnaire_id)))
    setCompleted(
      assignments
        .filter(a => responseMap.has(a.questionnaire_id))
        .map(a => ({ ...a, response: responseMap.get(a.questionnaire_id) as any }))
        .sort((a, b) => new Date(b.response.submitted_at).getTime() - new Date(a.response.submitted_at).getTime())
    )
    setLoading(false)
  }

  const openForm = (a: Assignment) => {
    const initial: Record<string, any> = {}
    a.questionnaire.questions.forEach(q => {
      initial[q.id] = q.type === 'multiple' ? [] : ''
    })
    setAnswers(initial)
    setError('')
    setActive(a)
  }

  const closeForm = () => { setActive(null); setSaving(false) }

  const setAnswer = (qId: string, value: any) => setAnswers(p => ({ ...p, [qId]: value }))

  const toggleMultiple = (qId: string, option: string) => {
    setAnswers(p => {
      const arr: string[] = p[qId] || []
      return { ...p, [qId]: arr.includes(option) ? arr.filter(x => x !== option) : [...arr, option] }
    })
  }

  const submit = async () => {
    if (!active || !studentId) return
    const missing = active.questionnaire.questions.find(q => {
      if (!q.required) return false
      const v = answers[q.id]
      if (v == null || v === '') return true
      if (Array.isArray(v) && v.length === 0) return true
      return false
    })
    if (missing) { setError(`Campo obrigatório: "${missing.text}"`); return }

    setSaving(true); setError('')
    const { error: err } = await supabase.from('questionnaire_responses').insert({
      questionnaire_id: active.questionnaire_id,
      student_id: studentId,
      answers,
      submitted_at: new Date().toISOString(),
    })
    if (err) { setError(err.message); setSaving(false); return }
    closeForm()
    load()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: '20px 16px 48px', maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Questionários</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>
            {pending.length > 0 ? `${pending.length} pendente${pending.length > 1 ? 's' : ''}` : 'Tudo respondido'}
            {completed.length > 0 ? ` · ${completed.length} respondido${completed.length > 1 ? 's' : ''}` : ''}
          </p>
        </div>

        {pending.length === 0 && completed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <ClipboardList size={24} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhum questionário</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>Seu coach ainda não enviou nenhum questionário</p>
          </div>
        )}

        {/* Pendentes */}
        {pending.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Pendentes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {pending.map(a => (
                <button key={a.id} onClick={() => openForm(a)}
                  style={{ width: '100%', backgroundColor: 'rgba(232,255,0,0.06)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 14, padding: '16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(232,255,0,0.2)')}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClipboardList size={18} color="#0A0A0A" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.questionnaire.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0' }}>
                      {a.questionnaire.questions.length} pergunta{a.questionnaire.questions.length !== 1 ? 's' : ''}
                      {a.due_date ? ` · Prazo: ${fmt(a.due_date)}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 18, color: 'var(--text-3)' }}>›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Respondidos */}
        {completed.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Respondidos</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {completed.map(item => (
                <div key={item.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  <button onClick={() => setExpandedCompleted(p => ({ ...p, [item.id]: !p[item.id] }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,200,83,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={16} color="#00C853" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.questionnaire.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>Respondido em {fmt(item.response.submitted_at)}</p>
                    </div>
                    <ChevronDown size={16} color="#888" style={{ transform: expandedCompleted[item.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                  </button>

                  {expandedCompleted[item.id] && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {item.questionnaire.questions.map((q, i) => {
                        const ans = item.response.answers[q.id]
                        const display = ans == null || ans === '' || (Array.isArray(ans) && ans.length === 0)
                          ? 'Sem resposta'
                          : Array.isArray(ans) ? ans.join(', ')
                          : q.type === 'date' && typeof ans === 'string' && ans.match(/^\d{4}-\d{2}-\d{2}$/)
                          ? new Date(ans + 'T12:00:00').toLocaleDateString('pt-BR')
                          : String(ans)
                        return (
                          <div key={q.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 3px' }}>{i + 1}. {q.text}</p>
                            <p style={{ fontSize: 14, fontWeight: 600, color: display === 'Sem resposta' ? 'var(--text-3)' : 'var(--text)', margin: 0, fontStyle: display === 'Sem resposta' ? 'italic' : 'normal' }}>{display}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom sheet com formulário */}
      {active && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'max(24px,env(safe-area-inset-bottom,24px))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 1 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{active.questionnaire.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0' }}>{active.questionnaire.questions.length} pergunta{active.questionnaire.questions.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {active.questionnaire.questions.map((q, i) => (
                <div key={q.id}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>
                    {i + 1}. {q.text}
                    {q.required && <span style={{ color: '#FF4444', marginLeft: 3 }}>*</span>}
                  </p>
                  <QuestionInput q={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} onToggle={opt => toggleMultiple(q.id, opt)} />
                </div>
              ))}

              {error && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeForm}
                  style={{ flex: 1, padding: '12px 0', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={submit} disabled={saving}
                  style={{ flex: 2, padding: '12px 0', backgroundColor: saving ? 'var(--border)' : '#E8FF00', color: saving ? 'var(--text-2)' : '#0A0A0A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Enviando…' : 'Enviar respostas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionInput({ q, value, onChange, onToggle }: {
  q: Question
  value: any
  onChange: (v: any) => void
  onToggle: (opt: string) => void
}) {
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const focus = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = '#E8FF00' }
  const blur = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }

  if (q.type === 'text') {
    return (
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
        style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
        onFocus={focus} onBlur={blur} />
    )
  }

  if (q.type === 'number') {
    return (
      <input type="number" value={value || ''} onChange={e => onChange(e.target.value)}
        style={inputBase} onFocus={focus} onBlur={blur} />
    )
  }

  if (q.type === 'date') {
    return (
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        style={inputBase} onFocus={focus} onBlur={blur} />
    )
  }

  if (q.type === 'scale') {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: 10 }, (_, k) => k + 1).map(n => {
          const sel = value === n || value === String(n)
          return (
            <button key={n} onClick={() => onChange(n)}
              style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? '#E8FF00' : 'var(--bg)', color: sel ? '#0A0A0A' : 'var(--text)', fontSize: 14, fontWeight: sel ? 800 : 500, cursor: 'pointer', flexShrink: 0 }}>
              {n}
            </button>
          )
        })}
      </div>
    )
  }

  if (q.type === 'single') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(q.options || []).map(opt => {
          const sel = value === opt
          return (
            <button key={opt} onClick={() => onChange(opt)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? 'rgba(232,255,0,0.07)' : 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${sel ? '#E8FF00' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sel && <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8FF00' }} />}
              </div>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (q.type === 'multiple') {
    const selected: string[] = value || []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(q.options || []).map(opt => {
          const sel = selected.includes(opt)
          return (
            <button key={opt} onClick={() => onToggle(opt)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? 'rgba(232,255,0,0.07)' : 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? '#E8FF00' : 'var(--border)'}`, backgroundColor: sel ? '#E8FF00' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sel && <Check size={11} color="#0A0A0A" />}
              </div>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return null
}
