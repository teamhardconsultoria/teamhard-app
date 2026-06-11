import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Trash2, Send, FileText, ChevronDown, ChevronUp, Check, ClipboardList, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

type QuestionType = 'text' | 'number' | 'scale' | 'single' | 'multiple' | 'date'
interface Question { id: string; type: QuestionType; text: string; required: boolean; options?: string[] }
interface Questionnaire { id: string; title: string; questions: Question[]; created_at: string; assignmentCount: number; responseCount: number }
interface Response { id: string; student_id: string; studentName: string; answers: Record<string, any>; submitted_at: string }
interface PendingStudent { id: string; name: string }
interface Student { id: string; name: string }

interface AnamneseRecord {
  studentId: string; studentName: string; completed: boolean
  data: Record<string, any> | null
}

const TYPE_LABELS: Record<QuestionType, string> = { text:'Texto livre', number:'Número', scale:'Escala (1–10)', single:'Seleção única', multiple:'Múltipla escolha', date:'Data' }

const GOAL_LBL: Record<string, string> = { weight_loss:'Emagrecimento', muscle_gain:'Ganho de massa', health:'Saúde', performance:'Performance', other:'Outro' }
const SEX_LBL: Record<string, string> = { male:'Masculino', female:'Feminino' }
const FITNESS_LBL: Record<string, string> = { beginner:'Iniciante', intermediate:'Intermediário', advanced:'Avançado' }
const GYM_LBL: Record<string, string> = { never:'Nunca treinou', less_6mo:'< 6 meses', '6mo_2yr':'6 meses – 2 anos', more_2yr:'> 2 anos' }
const ALCOHOL_LBL: Record<string, string> = { none:'Não consome', rarely:'Raramente', '1_2_week':'1–2x/semana', '3_plus_week':'3+ vezes/semana' }
const WORK_LBL: Record<string, string> = { sedentary:'Sedentário', light:'Leve', moderate:'Moderado', intense:'Intenso' }
const TIME_LBL: Record<string, string> = { morning:'Manhã', afternoon:'Tarde', evening:'Noite', variable:'Variável' }
const emptyQ = (): Question => ({ id: crypto.randomUUID(), type:'text', text:'', required:true })
const spin = { width:24, height:24, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

const inputStyle = { width:'100%', padding:'11px 14px', backgroundColor:'#0A0A0A', border:'1px solid var(--border)', borderRadius:10, color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box' as const }
const labelStyle = { fontSize:11, color:'#888', textTransform:'uppercase' as const, letterSpacing:1 }

export default function Questionnaires() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [selected, setSelected] = useState<Questionnaire | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingResponses, setLoadingResponses] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [sendToStudentId, setSendToStudentId] = useState<string | null>(null)
  const [pendingStudents, setPendingStudents] = useState<PendingStudent[]>([])
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({})
  const [showAnamnese, setShowAnamnese] = useState(false)
  const [anamneseList, setAnamneseList] = useState<AnamneseRecord[]>([])
  const [loadingAnamnese, setLoadingAnamnese] = useState(false)
  const [expandedAnamnese, setExpandedAnamnese] = useState<Record<string, boolean>>({})

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)
    await Promise.all([loadQuestionnaires(coach.id), loadStudents(coach.id)])
    setLoading(false)
  }

  const loadQuestionnaires = async (cId: string) => {
    const { data } = await supabase.from('questionnaires').select('id, title, questions, created_at').eq('coach_id', cId).order('created_at', { ascending: false })
    const withCounts: Questionnaire[] = await Promise.all((data || []).map(async (q: any) => {
      const [a, r] = await Promise.all([
        supabase.from('questionnaire_assignments').select('id', { count:'exact', head:true }).eq('questionnaire_id', q.id),
        supabase.from('questionnaire_responses').select('id', { count:'exact', head:true }).eq('questionnaire_id', q.id),
      ])
      return { ...q, assignmentCount: a.count || 0, responseCount: r.count || 0 }
    }))
    setQuestionnaires(withCounts)
  }

  const loadStudents = async (cId: string) => {
    const { data } = await supabase.from('students').select('id, user:users(name)').eq('coach_id', cId)
    setStudents((data || []).map((s: any) => ({ id: s.id, name: s.user.name })))
  }

  const handleSelectAnamnese = async (cId: string) => {
    setShowAnamnese(true); setSelected(null); setExpandedAnamnese({})
    setLoadingAnamnese(true)
    const { data } = await supabase.from('students').select(`
      id, user:users(name),
      anamnese(full_name, birth_date, biological_sex, city, profession,
        goal, current_weight, height, desired_weight, goal_months,
        has_disease, disease_description, uses_medication, medication_description,
        has_injury, injury_description, has_limitation, limitation_description, is_pregnant,
        has_allergy, allergy_description, food_restrictions, meals_per_day, water_liters, alcohol_consumption,
        sleep_hours, stress_level, work_type, has_busy_routine, preferred_workout_time,
        gym_experience, practices_sport, sport_description, fitness_level,
        tmb, get_value, completed, created_at)
    `).eq('coach_id', cId)
    setAnamneseList((data || []).map((s: any) => ({
      studentId: s.id,
      studentName: (s.user as any)?.name || '?',
      completed: !!(s.anamnese as any)?.completed,
      data: (s.anamnese as any) || null,
    })))
    setLoadingAnamnese(false)
  }

  const selectQuestionnaire = async (q: Questionnaire) => {
    setShowAnamnese(false); setSelected(q); setExpandedResponses({}); setLoadingResponses(true); setPendingStudents([])
    const [respRes, assignRes] = await Promise.all([
      supabase.from('questionnaire_responses').select('id, student_id, answers, submitted_at, student:students(user:users(name))').eq('questionnaire_id', q.id).order('submitted_at', { ascending: false }),
      supabase.from('questionnaire_assignments').select('student_id, student:students(user:users(name))').eq('questionnaire_id', q.id),
    ])
    const respondedIds = new Set((respRes.data || []).map((r: any) => r.student_id))
    setResponses((respRes.data || []).map((r: any) => ({ id: r.id, student_id: r.student_id, studentName: r.student?.user?.name || '?', answers: r.answers, submitted_at: r.submitted_at })))
    setPendingStudents((assignRes.data || []).filter((a: any) => !respondedIds.has(a.student_id)).map((a: any) => ({ id: a.student_id, name: a.student?.user?.name || '?' })))
    setLoadingResponses(false)
  }

  const deleteQuestionnaire = async (id: string) => {
    if (!confirm('Excluir este questionário? Todas as respostas serão perdidas.')) return
    await supabase.from('questionnaires').delete().eq('id', id)
    setQuestionnaires(prev => prev.filter(q => q.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', backgroundColor:'#0A0A0A' }}>
      {/* Sidebar */}
      <div style={{ width:280, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:900, color:'#fff', margin:0 }}>Questionários</h1>
            <p style={{ fontSize:12, color:'#888', marginTop:2 }}>{questionnaires.length} criado{questionnaires.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ width:32, height:32, backgroundColor:'#E8FF00', borderRadius:8, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <Plus size={16} color="#0A0A0A" />
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {/* Anamnese — item fixo */}
          <button onClick={() => coachId && handleSelectAnamnese(coachId)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', width:'100%', textAlign:'left', backgroundColor: showAnamnese ? '#161616' : 'transparent', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
            onMouseEnter={e => { if (!showAnamnese) e.currentTarget.style.backgroundColor = '#111' }}
            onMouseLeave={e => { if (!showAnamnese) e.currentTarget.style.backgroundColor = 'transparent' }}>
            <div style={{ width:32, height:32, borderRadius:8, backgroundColor: showAnamnese ? '#E8FF00' : 'rgba(232,255,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <ClipboardList size={14} color={showAnamnese ? '#0A0A0A' : '#E8FF00'} />
            </div>
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:0 }}>Anamnese dos Alunos</p>
              <p style={{ fontSize:11, color:'#888', margin:'2px 0 0 0' }}>Formulário de saúde e objetivos</p>
            </div>
          </button>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
          ) : questionnaires.length === 0 ? (
            <div style={{ padding:24, textAlign:'center' }}>
              <FileText size={28} color="#888" style={{ margin:'0 auto 12px' }} />
              <p style={{ fontSize:13, color:'#888', margin:0 }}>Nenhum questionário ainda.</p>
              <button onClick={() => setShowCreate(true)} style={{ fontSize:12, color:'#E8FF00', background:'none', border:'none', cursor:'pointer', marginTop:8 }}>Criar o primeiro</button>
            </div>
          ) : questionnaires.map(q => (
            <QRow key={q.id} q={q} isSelected={selected?.id === q.id} onClick={() => selectQuestionnaire(q)} formatDate={formatDate} />
          ))}
        </div>
      </div>

      {/* Painel direito */}
      {showAnamnese ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:0 }}>Anamnese dos Alunos</p>
            <p style={{ fontSize:12, color:'#888', margin:0 }}>
              {anamneseList.filter(a => a.completed).length} preenchida{anamneseList.filter(a => a.completed).length !== 1 ? 's' : ''} · {anamneseList.filter(a => !a.data).length} pendente{anamneseList.filter(a => !a.data).length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            {loadingAnamnese ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:720 }}>
                {anamneseList.map(a => (
                  <AnamneseCard key={a.studentId} record={a}
                    expanded={!!expandedAnamnese[a.studentId]}
                    onToggle={() => setExpandedAnamnese(p => ({ ...p, [a.studentId]: !p[a.studentId] }))}
                    onSend={() => navigate(`/coach/chat/${a.studentId}`)} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : selected ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.title}</p>
              <p style={{ fontSize:12, color:'#888', margin:0 }}>{selected.questions.length} perguntas · {selected.assignmentCount} enviado{selected.assignmentCount !== 1 ? 's' : ''} · {selected.responseCount} resposta{selected.responseCount !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={() => { setSendToStudentId(null); setShowSend(true) }} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', backgroundColor:'#E8FF00', color:'#0A0A0A', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                <Send size={12} /> Enviar
              </button>
              <button onClick={() => deleteQuestionnaire(selected.id)} style={{ padding:7, color:'#888', background:'none', border:'none', cursor:'pointer', borderRadius:8 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            {/* Perguntas */}
            <div style={{ maxWidth:640, marginBottom:32 }}>
              <p style={{ ...labelStyle, margin:'0 0 12px 0' }}>Perguntas</p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {selected.questions.map((q, i) => (
                  <div key={q.id} style={{ backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                      <p style={{ fontSize:14, color:'#fff', margin:0 }}>
                        <span style={{ color:'#888', marginRight:6 }}>{i + 1}.</span>{q.text}
                        {q.required && <span style={{ color:'#FF4444', marginLeft:4 }}>*</span>}
                      </p>
                      <span style={{ fontSize:10, backgroundColor:'#1E1E1E', color:'#888', padding:'2px 8px', borderRadius:20, flexShrink:0 }}>{TYPE_LABELS[q.type]}</span>
                    </div>
                    {(q.type === 'single' || q.type === 'multiple') && q.options && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                        {q.options.map(opt => <span key={opt} style={{ fontSize:12, backgroundColor:'#0A0A0A', border:'1px solid var(--border)', color:'#888', padding:'2px 8px', borderRadius:20 }}>{opt}</span>)}
                      </div>
                    )}
                    {q.type === 'scale' && (
                      <div style={{ display:'flex', gap:4, marginTop:8 }}>
                        {Array.from({ length:10 }, (_, k) => (
                          <div key={k} style={{ width:24, height:24, borderRadius:4, backgroundColor:'#1E1E1E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#888' }}>{k+1}</div>
                        ))}
                      </div>
                    )}
                    {q.type === 'date' && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'8px 12px', backgroundColor:'#0A0A0A', border:'1px solid var(--border)', borderRadius:8, width:'fit-content' }}>
                        <span style={{ fontSize:12, color:'#888' }}>📅</span>
                        <span style={{ fontSize:12, color:'#555' }}>DD/MM/AAAA</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Alunos aguardando */}
            {pendingStudents.length > 0 && (
              <div style={{ maxWidth:640, marginBottom:32 }}>
                <p style={{ ...labelStyle, margin:'0 0 12px 0' }}>Aguardando resposta ({pendingStudents.length})</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {pendingStudents.map(s => (
                    <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ width:32, height:32, borderRadius:16, backgroundColor:'rgba(255,152,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#FF9800', flexShrink:0 }}>{s.name.charAt(0)}</div>
                      <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#fff' }}>{s.name}</span>
                      <button onClick={() => { setSendToStudentId(s.id); setShowSend(true) }}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', backgroundColor:'rgba(232,255,0,0.1)', border:'1px solid rgba(232,255,0,0.3)', borderRadius:7, color:'#E8FF00', fontSize:12, fontWeight:700, cursor:'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.1)')}>
                        <Send size={11} /> Enviar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Respostas */}
            <div style={{ maxWidth:640 }}>
              <p style={{ ...labelStyle, margin:'0 0 12px 0' }}>Respostas {responses.length > 0 && `(${responses.length})`}</p>
              {loadingResponses ? (
                <div style={{ display:'flex', justifyContent:'center', paddingTop:32 }}><div style={spin} /></div>
              ) : responses.length === 0 ? (
                <div style={{ backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:12, padding:32, textAlign:'center' }}>
                  <p style={{ fontSize:13, color:'#888', margin:0 }}>Nenhuma resposta ainda. Envie para os alunos!</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {responses.map(r => (
                    <div key={r.id} style={{ backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                      <button onClick={() => setExpandedResponses(p => ({ ...p, [r.id]: !p[r.id] }))}
                        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161616')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:16, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#0A0A0A', flexShrink:0 }}>{r.studentName.charAt(0)}</div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:600, color:'#fff', margin:0 }}>{r.studentName}</p>
                            <p style={{ fontSize:11, color:'#888', margin:0 }}>{new Date(r.submitted_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                          </div>
                        </div>
                        {expandedResponses[r.id] ? <ChevronUp size={15} color="#888" /> : <ChevronDown size={15} color="#888" />}
                      </button>
                      {expandedResponses[r.id] && (
                        <div style={{ borderTop:'1px solid var(--border)' }}>
                          {selected.questions.map((q, i) => {
                            const answer = r.answers[q.id]
                            return (
                              <div key={q.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                                <p style={{ fontSize:11, color:'#888', margin:'0 0 4px 0' }}>{i+1}. {q.text}</p>
                                <p style={{ fontSize:13, fontWeight:500, color: answer == null || answer === '' ? 'var(--text-3)' : '#fff', margin:0, fontStyle: answer == null || answer === '' ? 'italic' : 'normal' }}>
                                  {answer == null || answer === '' ? 'Sem resposta' : Array.isArray(answer) ? answer.join(', ') : q.type === 'date' && typeof answer === 'string' && answer.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(answer + 'T12:00:00').toLocaleDateString('pt-BR') : String(answer)}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:32, backgroundColor:'#1E1E1E', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}><FileText size={24} color="#888" /></div>
            <p style={{ color:'#fff', fontWeight:600, fontSize:14, margin:0 }}>Selecione um questionário</p>
            <p style={{ color:'#888', fontSize:13, marginTop:6 }}>Ou crie um novo com o botão +</p>
          </div>
        </div>
      )}


      {showCreate && coachId && (
        <CreateModal coachId={coachId} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); if (coachId) await loadQuestionnaires(coachId) }} />
      )}
      {showSend && selected && (
        <SendModal questionnaire={selected} students={students} defaultStudentId={sendToStudentId} onClose={() => { setShowSend(false); setSendToStudentId(null) }}
          onSent={async () => { setShowSend(false); setSendToStudentId(null); if (coachId) await loadQuestionnaires(coachId); if (selected) await selectQuestionnaire(selected) }} />
      )}
    </div>
  )
}

function AnamneseCard({ record, expanded, onToggle, onSend }: { record: AnamneseRecord; expanded: boolean; onToggle: () => void; onSend: () => void }) {
  const a = record.data
  const age = a?.birth_date ? Math.floor((Date.now() - new Date(a.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000)) : null

  return (
    <div style={{ backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <button onClick={onToggle} style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161616')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <div style={{ width:36, height:36, borderRadius:18, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#0A0A0A', flexShrink:0 }}>
          {record.studentName.charAt(0)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:0 }}>{record.studentName}</p>
          <p style={{ fontSize:11, color:'#888', margin:'2px 0 0 0' }}>
            {!a ? 'Não preenchida' : `${GOAL_LBL[a.goal] || a.goal}${age ? ` · ${age} anos` : ''}${a.fitness_level ? ` · ${FITNESS_LBL[a.fitness_level] || a.fitness_level}` : ''}`}
          </p>
        </div>
        {!a ? (
          <button onClick={e => { e.stopPropagation(); onSend() }}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', backgroundColor:'rgba(232,255,0,0.1)', border:'1px solid rgba(232,255,0,0.3)', borderRadius:7, color:'#E8FF00', fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.1)')}>
            <Send size={11} /> Enviar
          </button>
        ) : record.completed ? (
          <span style={{ fontSize:10, fontWeight:700, backgroundColor:'rgba(0,200,83,0.1)', color:'#00C853', padding:'2px 8px', borderRadius:20, flexShrink:0 }}>Completa</span>
        ) : (
          <span style={{ fontSize:10, fontWeight:700, backgroundColor:'rgba(255,152,0,0.1)', color:'#FF9800', padding:'2px 8px', borderRadius:20, flexShrink:0 }}>Parcial</span>
        )}
        {expanded ? <ChevronUp size={14} color="#888" style={{ flexShrink:0 }} /> : <ChevronDown size={14} color="#888" style={{ flexShrink:0 }} />}
      </button>

      {expanded && a && (
        <div style={{ borderTop:'1px solid var(--border)', padding:16, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Identificação */}
          <AnamneseSection title="Identificação">
            <ARow label="Sexo"       value={SEX_LBL[a.biological_sex] || a.biological_sex} />
            {age && <ARow label="Idade"     value={`${age} anos`} />}
            {a.city && <ARow label="Cidade"    value={a.city} />}
            {a.profession && <ARow label="Profissão" value={a.profession} />}
          </AnamneseSection>

          {/* Objetivo */}
          <AnamneseSection title="Objetivo">
            <ARow label="Meta"           value={GOAL_LBL[a.goal] || a.goal} />
            <ARow label="Peso atual"     value={`${a.current_weight} kg`} />
            <ARow label="Altura"         value={`${a.height} cm`} />
            {a.desired_weight && <ARow label="Peso desejado" value={`${a.desired_weight} kg`} />}
            {a.goal_months && <ARow label="Prazo"        value={`${a.goal_months} meses`} />}
            {a.fitness_level && <ARow label="Nível"        value={FITNESS_LBL[a.fitness_level] || a.fitness_level} />}
            {a.tmb && <ARow label="TMB"          value={`${Math.round(a.tmb)} kcal`} highlight />}
            {a.get_value && <ARow label="GET"          value={`${Math.round(a.get_value)} kcal`} highlight />}
          </AnamneseSection>

          {/* Saúde */}
          <AnamneseSection title="Saúde">
            <ARow label="Doenças"    value={a.has_disease ? (a.disease_description || 'Sim') : 'Nenhuma'} alert={a.has_disease} />
            <ARow label="Medicamentos" value={a.uses_medication ? (a.medication_description || 'Sim') : 'Nenhum'} alert={a.uses_medication} />
            <ARow label="Lesões"     value={a.has_injury ? (a.injury_description || 'Sim') : 'Nenhuma'} alert={a.has_injury} />
            <ARow label="Limitações" value={a.has_limitation ? (a.limitation_description || 'Sim') : 'Nenhuma'} alert={a.has_limitation} />
            {a.is_pregnant != null && <ARow label="Gestante" value={a.is_pregnant ? 'Sim' : 'Não'} alert={!!a.is_pregnant} />}
          </AnamneseSection>

          {/* Alimentação */}
          <AnamneseSection title="Alimentação">
            <ARow label="Alergias"       value={a.has_allergy ? (a.allergy_description || 'Sim') : 'Nenhuma'} alert={a.has_allergy} />
            {a.food_restrictions && <ARow label="Restrições"     value={a.food_restrictions} />}
            {a.meals_per_day && <ARow label="Refeições/dia"  value={String(a.meals_per_day)} />}
            {a.water_liters && <ARow label="Água"           value={`${a.water_liters} L/dia`} />}
            {a.alcohol_consumption && <ARow label="Álcool"         value={ALCOHOL_LBL[a.alcohol_consumption] || a.alcohol_consumption} />}
          </AnamneseSection>

          {/* Estilo de vida */}
          <AnamneseSection title="Estilo de Vida">
            {a.sleep_hours && <ARow label="Sono"           value={`${a.sleep_hours}h/noite`} />}
            {a.stress_level && <ARow label="Estresse (1-5)" value={String(a.stress_level)} />}
            {a.work_type && <ARow label="Trabalho"       value={WORK_LBL[a.work_type] || a.work_type} />}
            {a.has_busy_routine != null && <ARow label="Rotina agitada" value={a.has_busy_routine ? 'Sim' : 'Não'} />}
            {a.preferred_workout_time && <ARow label="Horário treino"  value={TIME_LBL[a.preferred_workout_time] || a.preferred_workout_time} />}
          </AnamneseSection>

          {/* Experiência */}
          <AnamneseSection title="Experiência Fitness">
            {a.gym_experience && <ARow label="Experiência"   value={GYM_LBL[a.gym_experience] || a.gym_experience} />}
            <ARow label="Pratica esporte" value={a.practices_sport ? (a.sport_description || 'Sim') : 'Não'} />
          </AnamneseSection>

        </div>
      )}
    </div>
  )
}

function AnamneseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize:10, color:'#888', fontWeight:700, textTransform:'uppercase', letterSpacing:1, margin:'0 0 8px 0' }}>{title}</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px' }}>{children}</div>
    </div>
  )
}

function ARow({ label, value, highlight, alert }: { label: string; value: string; highlight?: boolean; alert?: boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'4px 0', borderBottom:'1px solid #1A1A1A' }}>
      <span style={{ fontSize:12, color:'#888', flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color: highlight ? '#E8FF00' : alert ? '#FF9800' : '#fff', textAlign:'right' }}>{value}</span>
    </div>
  )
}

function QRow({ q, isSelected, onClick, formatDate }: { q:Questionnaire; isSelected:boolean; onClick:()=>void; formatDate:(s:string)=>string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', width:'100%', textAlign:'left', backgroundColor: isSelected || hovered ? '#161616' : 'transparent', borderBottom:'1px solid var(--border)', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer' }}>
      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'rgba(232,255,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
        <FileText size={14} color="#E8FF00" />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:13, fontWeight:600, color:'#fff', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.title}</p>
        <p style={{ fontSize:11, color:'#888', margin:'2px 0 0 0' }}>{q.questions.length} pergunta{q.questions.length !== 1 ? 's' : ''} · {q.responseCount} resposta{q.responseCount !== 1 ? 's' : ''}</p>
        <p style={{ fontSize:11, color:'#555', margin:'1px 0 0 0' }}>{formatDate(q.created_at)}</p>
      </div>
      {q.responseCount > 0 && (
        <span style={{ width:20, height:20, borderRadius:10, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{q.responseCount}</span>
      )}
    </button>
  )
}

function CreateModal({ coachId, onClose, onSaved }: { coachId:string; onClose:()=>void; onSaved:()=>void }) {
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<Question[]>([emptyQ()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateQ = (id: string, patch: Partial<Question>) => setQuestions(p => p.map(q => q.id === id ? { ...q, ...patch } : q))
  const addOpt = (qId: string) => setQuestions(p => p.map(q => q.id === qId ? { ...q, options: [...(q.options || []), ''] } : q))
  const updateOpt = (qId: string, idx: number, val: string) => setQuestions(p => p.map(q => q.id === qId ? { ...q, options: q.options?.map((o, i) => i === idx ? val : o) } : q))
  const removeOpt = (qId: string, idx: number) => setQuestions(p => p.map(q => q.id === qId ? { ...q, options: q.options?.filter((_, i) => i !== idx) } : q))

  const handleSave = async () => {
    if (!title.trim()) { setError('Título obrigatório.'); return }
    if (questions.some(q => !q.text.trim())) { setError('Todas as perguntas precisam de texto.'); return }
    if (questions.some(q => (q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length < 2))) { setError('Perguntas de seleção precisam de pelo menos 2 opções.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('questionnaires').insert({ coach_id: coachId, title: title.trim(), questions })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <Modal title="Novo Questionário" onClose={onClose} wide>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={labelStyle}>Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Anamnese inicial..." style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
        </div>

        <p style={{ ...labelStyle, margin:0 }}>Perguntas</p>
        {questions.map((q, idx) => (
          <div key={q.id} style={{ backgroundColor:'#0A0A0A', border:'1px solid var(--border)', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'#888', width:20, flexShrink:0 }}>{idx+1}.</span>
              <input value={q.text} onChange={e => updateQ(q.id, { text: e.target.value })} placeholder="Texto da pergunta..."
                style={{ flex:1, padding:'8px 10px', backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:8, color:'#fff', fontSize:13, outline:'none' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              <select value={q.type} onChange={e => { const t = e.target.value as QuestionType; updateQ(q.id, { type:t, options: (t==='single'||t==='multiple') ? ['',''] : undefined }) }}
                style={{ padding:'8px', backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:8, color:'#fff', fontSize:12, outline:'none' }}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#888', flexShrink:0 }}>
                <input type="checkbox" checked={q.required} onChange={e => updateQ(q.id, { required: e.target.checked })} style={{ accentColor:'#E8FF00' }} />Obrig.
              </label>
              {questions.length > 1 && (
                <button onClick={() => setQuestions(p => p.filter(x => x.id !== q.id))} style={{ background:'none', border:'none', color:'#888', cursor:'pointer', padding:2 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#FF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {(q.type === 'single' || q.type === 'multiple') && (
              <div style={{ marginLeft:28, display:'flex', flexDirection:'column', gap:6 }}>
                {(q.options || []).map((opt, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input value={opt} onChange={e => updateOpt(q.id, i, e.target.value)} placeholder={`Opção ${i+1}`}
                      style={{ flex:1, padding:'6px 10px', backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:6, color:'#fff', fontSize:12, outline:'none' }} />
                    {(q.options?.length || 0) > 2 && (
                      <button onClick={() => removeOpt(q.id, i)} style={{ background:'none', border:'none', color:'#888', cursor:'pointer' }}><X size={12} /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => addOpt(q.id)} style={{ fontSize:12, color:'#E8FF00', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>+ Adicionar opção</button>
              </div>
            )}
          </div>
        ))}

        <button onClick={() => setQuestions(p => [...p, emptyQ()])}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', border:'1px dashed #3A3A3A', borderRadius:10, color:'#888', fontSize:13, background:'none', cursor:'pointer', width:'100%', justifyContent:'center' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#E8FF00'; e.currentTarget.style.color='#E8FF00' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#3A3A3A'; e.currentTarget.style.color='#888' }}>
          <Plus size={14} /> Adicionar pergunta
        </button>

        {error && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{error}</p>}
        <div style={{ display:'flex', gap:10 }}>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn primary onClick={handleSave} disabled={saving} style={{ flex:2 }}>
            {saving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><Check size={15} /> Criar</>}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function SendModal({ questionnaire, students, defaultStudentId, onClose, onSent }: { questionnaire:Questionnaire; students:Student[]; defaultStudentId?:string|null; onClose:()=>void; onSent:()=>void }) {
  const [studentId, setStudentId] = useState(defaultStudentId || '')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!studentId) { setError('Selecione um aluno.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('questionnaire_assignments').upsert({ questionnaire_id: questionnaire.id, student_id: studentId, due_date: dueDate || null }, { onConflict: 'questionnaire_id,student_id' })
    if (err) { setError('Aluno já recebeu este questionário ou erro ao enviar.'); setSaving(false); return }
    onSent()
  }

  return (
    <Modal title="Enviar Questionário" subtitle={questionnaire.title} onClose={onClose}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={labelStyle}>Aluno *</label>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} style={inputStyle}>
            <option value="">Selecionar...</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={labelStyle}>Prazo (opcional)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
        </div>
        {error && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{error}</p>}
        <div style={{ display:'flex', gap:10 }}>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn primary onClick={handleSend} disabled={saving} style={{ flex:2 }}>
            {saving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><Send size={14} /> Enviar</>}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ title, subtitle, onClose, children, wide }: { title:string; subtitle?:string; onClose:()=>void; children:React.ReactNode; wide?:boolean }) {
  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
      <div style={{ backgroundColor:'#111', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth: wide ? 580 : 420, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:900, color:'#fff', margin:0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize:12, color:'#888', margin:'2px 0 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#888', cursor:'pointer', padding:4 }}><X size={18} /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>{children}</div>
      </div>
    </div>
  )
}

function Btn({ children, onClick, primary, disabled, style: extra }: { children:React.ReactNode; onClick?:()=>void; primary?:boolean; disabled?:boolean; style?:React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'12px 16px', borderRadius:12, fontSize:13, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid var(--border)', backgroundColor: primary ? '#E8FF00' : (hovered ? '#161616' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : '#888'), opacity: disabled ? 0.5 : 1, transition:'all 0.15s', ...extra }}>
      {children}
    </button>
  )
}
