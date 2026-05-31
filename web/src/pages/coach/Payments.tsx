import { useEffect, useState } from 'react'
import { Plus, X, Check, History, Zap, Copy, ExternalLink, ChevronLeft, Trash2, RefreshCw, Link, ShieldCheck } from 'lucide-react'
import { sendAutoMessage } from '../../lib/autoMessage'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface StudentPayment { id:string; name:string; email:string; plan_type:string; payment_status:string; plan_end:string }
interface Payment { id:string; amount:number; status:string; payment_method?:string; due_date:string; paid_at?:string; plan_type:string; created_at:string }

const STATUS_COLOR: Record<string, string> = { active:'#00C853', pending:'#FF9800', overdue:'#FF4444', blocked:'#FF4444' }
const STATUS_LABEL: Record<string, string> = { active:'Em dia', pending:'Pendente', overdue:'Vencido', blocked:'Bloqueado' }
const PLAN_LABEL: Record<string, string> = { monthly:'Mensal', quarterly:'Trimestral', semiannual:'Semestral', annual:'Anual' }
const PLAN_MONTHS: Record<string, number> = { monthly:1, quarterly:3, semiannual:6, annual:12 }
const METHODS = ['PIX','Dinheiro','Cartão de crédito','Cartão de débito','Boleto','Transferência']
const emptyForm = { amount:'', payment_method:'PIX', due_date: new Date().toISOString().split('T')[0], paid_at: new Date().toISOString().split('T')[0] }
const emptySub = { amount:'', billing_type:'CREDIT_CARD', due_date: new Date().toISOString().split('T')[0], cpf:'' }
const MAX_INSTALLMENTS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
type Filter = 'all'|'active'|'pending'|'overdue'|'blocked'
const spin = { width:20, height:20, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }
const inputStyle = { width:'100%', padding:'11px 14px', backgroundColor:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const }
const labelStyle = { fontSize:11, color:'var(--text-2)', textTransform:'uppercase' as const, letterSpacing:1 }
const formatDate = (d:string) => new Date(d).toLocaleDateString('pt-BR')
const formatMoney = (n:number) => n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

export default function Payments() {
  const { user } = useAuthStore()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentPayment[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [historyStudent, setHistoryStudent] = useState<StudentPayment | null>(null)
  const [history, setHistory] = useState<Payment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalStudent, setModalStudent] = useState<StudentPayment | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAsaas, setShowAsaas] = useState(false)
  const [asaasStudent, setAsaasStudent] = useState<StudentPayment | null>(null)
  const [asaasForm, setAsaasForm] = useState({ amount:'', billing_type:'PIX', due_date: new Date().toISOString().split('T')[0], cpf:'', installment_count: 1 })
  const [asaasResult, setAsaasResult] = useState<{ pixEncodedImage?:string; pixPayload?:string; bankSlipUrl?:string; invoiceUrl?:string } | null>(null)
  const [asaasSaving, setAsaasSaving] = useState(false)
  const [asaasError, setAsaasError] = useState('')
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showSub, setShowSub] = useState(false)
  const [subStudent, setSubStudent] = useState<StudentPayment | null>(null)
  const [subForm, setSubForm] = useState(emptySub)
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState('')
  const [subResult, setSubResult] = useState<{ paymentLink?:string } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)
    await loadStudents(coach.id)
    setLoading(false)
  }

  const loadStudents = async (cId: string) => {
    const { data } = await supabase.from('students').select('id, plan_type, payment_status, plan_end, user:users(name, email)').eq('coach_id', cId).order('created_at', { ascending: false })
    setStudents((data || []).map((s: any) => ({ id:s.id, name:s.user.name, email:s.user.email, plan_type:s.plan_type, payment_status:s.payment_status, plan_end:s.plan_end })))
  }

  const openHistory = async (student: StudentPayment) => {
    setHistoryStudent(student); setLoadingHistory(true)
    const { data } = await supabase.from('payments').select('id, amount, status, payment_method, due_date, paid_at, plan_type, created_at').eq('student_id', student.id).order('created_at', { ascending: false })
    setHistory(data || [])
    setLoadingHistory(false)
  }

  const handleRegister = async () => {
    if (!form.amount || !modalStudent || !coachId) { setError('Preencha o valor.'); return }
    setSaving(true); setError('')
    try {
      const base = new Date(modalStudent.plan_end); const now = new Date()
      const start = base > now ? base : now
      start.setMonth(start.getMonth() + (PLAN_MONTHS[modalStudent.plan_type] || 1))
      const newPlanEnd = start.toISOString().split('T')[0]
      await supabase.from('payments').insert({ student_id:modalStudent.id, amount:parseFloat(form.amount), status:'paid', payment_method:form.payment_method, due_date:form.due_date, paid_at:form.paid_at, plan_type:modalStudent.plan_type })
      await supabase.from('students').update({ payment_status:'active', plan_end:newPlanEnd }).eq('id', modalStudent.id)
      setShowModal(false)
      await loadStudents(coachId)
      if (historyStudent?.id === modalStudent.id) await openHistory(modalStudent)
    } catch (err: any) { setError(err.message || 'Erro ao registrar.') } finally { setSaving(false) }
  }

  const handleAsaas = async () => {
    if (!asaasForm.amount || !asaasStudent) { setAsaasError('Preencha o valor.'); return }
    setAsaasSaving(true); setAsaasError('')
    try {
      const chargeBody: Record<string, unknown> = { student_id:asaasStudent.id, amount:parseFloat(asaasForm.amount), due_date:asaasForm.due_date, billing_type:asaasForm.billing_type, cpf:asaasForm.cpf || undefined }
      if (asaasForm.billing_type === 'CREDIT_CARD' && asaasForm.installment_count > 1) chargeBody.installment_count = asaasForm.installment_count
      const { data, error: fnError } = await supabase.functions.invoke('asaas-create-charge', { body: chargeBody })
      if (fnError || data?.error) { setAsaasError(data?.error || fnError?.message || 'Erro ao criar cobrança.'); return }
      setAsaasResult(data)
      if (coachId) await loadStudents(coachId)
      if (historyStudent?.id === asaasStudent.id) await openHistory(asaasStudent)
      if (coachId) sendAutoMessage({ coachUserId: user!.id, coachId, studentId: asaasStudent.id, type: 'payment_pending', studentName: asaasStudent.name })
    } catch (err: any) { setAsaasError(err.message || 'Erro inesperado.') } finally { setAsaasSaving(false) }
  }

  const handleUnblock = async (student: StudentPayment) => {
    if (!window.confirm(`Reativar acesso de ${student.name}?\nO plano e a data de vencimento não serão alterados.`)) return
    await supabase.from('students').update({ payment_status: 'active', access_blocked: false }).eq('id', student.id)
    if (coachId) await loadStudents(coachId)
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Excluir esta cobrança?')) return
    setDeletingId(paymentId)
    await supabase.from('payments').delete().eq('id', paymentId)
    setHistory(prev => prev.filter(p => p.id !== paymentId))
    setDeletingId(null)
  }

  const handleSub = async () => {
    if (!subForm.amount || !subStudent) { setSubError('Preencha o valor.'); return }
    setSubSaving(true); setSubError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('asaas-create-subscription', {
        body: { student_id: subStudent.id, amount: parseFloat(subForm.amount), due_date: subForm.due_date, billing_type: subForm.billing_type, cpf: subForm.cpf || undefined },
      })
      if (fnErr || data?.error) { setSubError(data?.error || fnErr?.message || 'Erro ao criar assinatura.'); return }
      setSubResult(data)
    } catch (e:any) { setSubError(e.message || 'Erro inesperado.') } finally { setSubSaving(false) }
  }

  const filtered = filter === 'all' ? students : students.filter(s => s.payment_status === filter)
  const counts = { all:students.length, active:students.filter(s=>s.payment_status==='active').length, pending:students.filter(s=>s.payment_status==='pending').length, overdue:students.filter(s=>s.payment_status==='overdue').length, blocked:students.filter(s=>s.payment_status==='blocked').length }

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', backgroundColor:'var(--bg)' }}>
      {/* Lista principal */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:0 }}>Pagamentos</h1>
          <p style={{ fontSize:12, color:'var(--text-2)', marginTop:4, margin:'4px 0 0 0' }}>{students.length} aluno{students.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:6, padding:'10px 24px', borderBottom:'1px solid var(--border)', flexShrink:0, overflowX:'auto' }}>
          {([['all','Todos'],['active','Em dia'],['pending','Pendente'],['overdue','Vencido'],['blocked','Bloqueado']] as [Filter,string][]).map(([key, label]) => (
            <FilterBtn key={key} label={label} count={counts[key]} active={filter === key} onClick={() => setFilter(key)} />
          ))}
        </div>

        {/* Cards */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div style={spin} /></div>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign:'center', color:'var(--text-2)', fontSize:14, paddingTop:60 }}>Nenhum aluno neste filtro.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:700 }}>
              {filtered.map(student => (
                <StudentCard key={student.id} student={student}
                  onHistory={() => openHistory(student)}
                  onAsaas={() => { setAsaasStudent(student); setAsaasForm({ amount:'', billing_type:'PIX', due_date: new Date().toISOString().split('T')[0], cpf:'', installment_count: 1 }); setAsaasResult(null); setAsaasError(''); setShowAsaas(true) }}
                  onManual={() => { setModalStudent(student); setForm(emptyForm); setError(''); setShowModal(true) }}
                  onSub={() => { setSubStudent(student); setSubForm(emptySub); setSubResult(null); setSubError(''); setShowSub(true) }}
                  onUnblock={() => handleUnblock(student)}
                  isHistoryActive={historyStudent?.id === student.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Painel de histórico */}
      {historyStudent && (
        <div style={{ width:300, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', flexShrink:0, backgroundColor:'var(--bg)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={() => setHistoryStudent(null)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:2 }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{historyStudent.name}</p>
              <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>Histórico de pagamentos</p>
            </div>
            <button onClick={() => { setModalStudent(historyStudent); setForm(emptyForm); setError(''); setShowModal(true) }}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', backgroundColor:'#E8FF00', color:'#0A0A0A', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
              <Plus size={12} /> Novo
            </button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:16 }}>
            {loadingHistory ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
            ) : history.length === 0 ? (
              <p style={{ color:'var(--text-2)', fontSize:13, textAlign:'center', paddingTop:40 }}>Nenhum pagamento registrado.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {history.map(p => (
                  <div key={p.id} style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:14 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:16, fontWeight:900, color:'var(--text)' }}>{formatMoney(p.amount)}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:20, backgroundColor: p.status==='paid' ? 'rgba(0,200,83,0.1)' : 'rgba(255,152,0,0.1)', color: p.status==='paid' ? '#00C853' : '#FF9800' }}>
                          {p.status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                        {p.status !== 'paid' && (
                          <button onClick={() => handleDeletePayment(p.id)} disabled={deletingId === p.id} title="Excluir cobrança"
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:5, background:'none', border:'none', cursor: deletingId === p.id ? 'not-allowed' : 'pointer', color:'#FF4444', opacity: deletingId === p.id ? 0.4 : 1, borderRadius:6 }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Vencimento: <span style={{ color:'var(--text)' }}>{formatDate(p.due_date)}</span></p>
                    {p.paid_at && <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Pago em: <span style={{ color:'#00C853' }}>{formatDate(p.paid_at)}</span></p>}
                    {p.payment_method && <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Método: <span style={{ color:'var(--text)' }}>{p.payment_method}</span></p>}
                    <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{PLAN_LABEL[p.plan_type]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal registrar pagamento */}
      {showModal && modalStudent && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'var(--text)', margin:0 }}>Registrar Pagamento</h2>
                <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{modalStudent.name} · {PLAN_LABEL[modalStudent.plan_type]}</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:4 }}><X size={18} /></button>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <MField label="Valor (R$) *">
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount:e.target.value }))} placeholder="0,00" style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
              </MField>
              <MField label="Forma de pagamento">
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method:e.target.value }))} style={inputStyle}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </MField>
              <div style={{ display:'flex', gap:10 }}>
                <MField label="Vencimento">
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date:e.target.value }))} style={inputStyle} />
                </MField>
                <MField label="Data do pagamento">
                  <input type="date" value={form.paid_at} onChange={e => setForm(p => ({ ...p, paid_at:e.target.value }))} style={inputStyle} />
                </MField>
              </div>
              <div style={{ backgroundColor:'rgba(232,255,0,0.05)', border:'1px solid rgba(232,255,0,0.15)', borderRadius:10, padding:'10px 12px' }}>
                <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>Ao registrar, o aluno ficará <span style={{ color:'#00C853', fontWeight:600 }}>Em dia</span> e o plano será renovado por <span style={{ color:'var(--text)', fontWeight:600 }}>{PLAN_MONTHS[modalStudent.plan_type]} {PLAN_MONTHS[modalStudent.plan_type] === 1 ? 'mês' : 'meses'}</span>.</p>
              </div>
              {error && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{error}</p>}
              <div style={{ display:'flex', gap:10 }}>
                <MBtn onClick={() => setShowModal(false)}>Cancelar</MBtn>
                <MBtn primary onClick={handleRegister} disabled={saving} style={{ flex:2 }}>
                  {saving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><Check size={15} /> Confirmar</>}
                </MBtn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Assinatura Recorrente */}
      {showSub && subStudent && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth:440 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'var(--text)', margin:0 }}>Assinatura Recorrente</h2>
                <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{subStudent.name} · {PLAN_LABEL[subStudent.plan_type]}</p>
              </div>
              <button onClick={() => setShowSub(false)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:4 }}><X size={18} /></button>
            </div>

            {subResult ? (
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ backgroundColor:'rgba(0,200,83,0.08)', border:'1px solid rgba(0,200,83,0.2)', borderRadius:12, padding:14, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <Check size={18} color="#00C853" style={{ flexShrink:0, marginTop:1 }} />
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:'#00C853', margin:'0 0 4px 0' }}>Assinatura criada com sucesso!</p>
                    <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>O aluno será cobrado automaticamente em cada ciclo.</p>
                  </div>
                </div>
                {subResult.paymentLink && (
                  <>
                    <div>
                      <p style={{ fontSize:11, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:1, margin:'0 0 8px 0' }}>Link de pagamento (cartão)</p>
                      <div style={{ display:'flex', gap:8 }}>
                        <input readOnly value={subResult.paymentLink} style={{ ...inputStyle, flex:1, fontSize:11 }} />
                        <button onClick={() => { navigator.clipboard.writeText(subResult!.paymentLink!); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                          style={{ padding:'0 14px', backgroundColor:'#E8FF00', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:12, color:'#0A0A0A', flexShrink:0 }}>
                          {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                      <p style={{ fontSize:11, color:'var(--text-2)', margin:'6px 0 0 0' }}>Envie este link ao aluno para ele cadastrar o cartão.</p>
                    </div>
                    <a href={subResult.paymentLink} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'11px 16px', border:'1px solid var(--border)', borderRadius:12, fontSize:13, color:'var(--text)', textDecoration:'none' }}>
                      <Link size={14} /> Abrir link
                    </a>
                  </>
                )}
                <MBtn onClick={() => setShowSub(false)}>Fechar</MBtn>
              </div>
            ) : (
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ display:'flex', gap:10 }}>
                  <MField label="Valor (R$) *">
                    <input type="number" step="0.01" min="0" value={subForm.amount} onChange={e => setSubForm(p => ({ ...p, amount:e.target.value }))} placeholder="0,00" style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
                  </MField>
                  <MField label="Primeiro vencimento">
                    <input type="date" value={subForm.due_date} onChange={e => setSubForm(p => ({ ...p, due_date:e.target.value }))} style={inputStyle} />
                  </MField>
                </div>
                <MField label="CPF do aluno (se não cadastrado)">
                  <input type="text" value={subForm.cpf} onChange={e => setSubForm(p => ({ ...p, cpf:e.target.value }))} placeholder="000.000.000-00" style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
                </MField>
                <div style={{ backgroundColor:'rgba(232,255,0,0.05)', border:'1px solid rgba(232,255,0,0.15)', borderRadius:10, padding:'10px 12px' }}>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>Cobrança <strong style={{ color:'var(--text)' }}>mensal automática</strong> pelo Asaas. O número de cobranças é definido pelo plano do aluno: Mensal (contínuo), Trimestral (3x), Semestral (6x), Anual (12x).</p>
                </div>
                {subError && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{subError}</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <MBtn onClick={() => setShowSub(false)}>Cancelar</MBtn>
                  <MBtn primary onClick={handleSub} disabled={subSaving} style={{ flex:2 }}>
                    {subSaving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><RefreshCw size={14} /> Criar Assinatura</>}
                  </MBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Asaas */}
      {showAsaas && asaasStudent && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'var(--text)', margin:0 }}>Cobrar via Asaas</h2>
                <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{asaasStudent.name} · {PLAN_LABEL[asaasStudent.plan_type]}</p>
              </div>
              <button onClick={() => setShowAsaas(false)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:4 }}><X size={18} /></button>
            </div>
            {asaasResult ? (
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                {/* PIX */}
                {asaasResult.pixEncodedImage && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                    <p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:0 }}>QR Code PIX</p>
                    <img src={`data:image/png;base64,${asaasResult.pixEncodedImage}`} alt="QR Code PIX" style={{ width:192, height:192, borderRadius:12, border:'1px solid var(--border)' }} />
                    {asaasResult.pixPayload && (
                      <button onClick={() => { navigator.clipboard.writeText(asaasResult!.pixPayload!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'12px 16px', backgroundColor:'#E8FF00', color:'#0A0A0A', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                        {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar código PIX</>}
                      </button>
                    )}
                  </div>
                )}
                {/* Boleto */}
                {asaasResult.bankSlipUrl && (
                  <a href={asaasResult.bankSlipUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'12px 16px', backgroundColor:'#E8FF00', color:'#0A0A0A', borderRadius:12, fontSize:13, fontWeight:700, textDecoration:'none' }}>
                    <ExternalLink size={15} /> Abrir Boleto
                  </a>
                )}
                {/* Cartão de crédito / débito */}
                {(asaasForm.billing_type === 'CREDIT_CARD' || asaasForm.billing_type === 'DEBIT_CARD') && asaasResult.invoiceUrl && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ backgroundColor:'rgba(0,200,83,0.08)', border:'1px solid rgba(0,200,83,0.2)', borderRadius:10, padding:'10px 14px' }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#00C853', margin:'0 0 2px 0' }}>Cobrança gerada!</p>
                      <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>
                        Compartilhe o link abaixo para o aluno pagar com {asaasForm.billing_type === 'CREDIT_CARD' ? `cartão de crédito${asaasForm.installment_count > 1 ? ` em ${asaasForm.installment_count}x` : ' à vista'}` : 'cartão de débito'}.
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <input readOnly value={asaasResult.invoiceUrl} style={{ ...inputStyle, flex:1, fontSize:11 }} />
                      <button onClick={() => { navigator.clipboard.writeText(asaasResult!.invoiceUrl!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        style={{ padding:'0 14px', backgroundColor:'#E8FF00', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:12, color:'#0A0A0A', flexShrink:0 }}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <a href={asaasResult.invoiceUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'11px 16px', border:'1px solid var(--border)', color:'var(--text-2)', borderRadius:12, fontSize:13, textDecoration:'none' }}>
                      <ExternalLink size={14} /> Abrir link de pagamento
                    </a>
                  </div>
                )}
                {/* Fatura genérica (PIX/Boleto) */}
                {(asaasForm.billing_type === 'PIX' || asaasForm.billing_type === 'BOLETO') && asaasResult.invoiceUrl && (
                  <a href={asaasResult.invoiceUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'11px 16px', border:'1px solid var(--border)', color:'var(--text-2)', borderRadius:12, fontSize:13, textDecoration:'none' }}>
                    <ExternalLink size={14} /> Ver fatura
                  </a>
                )}
                <MBtn onClick={() => setShowAsaas(false)}>Fechar</MBtn>
              </div>
            ) : (
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                <MField label="Forma de cobrança">
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {[['PIX','PIX'],['BOLETO','Boleto'],['CREDIT_CARD','Crédito'],['DEBIT_CARD','Débito']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setAsaasForm(p => ({ ...p, billing_type:val, installment_count:1 }))}
                        style={{ flex:1, padding:'10px 0', borderRadius:10, fontSize:13, fontWeight:700, border: asaasForm.billing_type===val ? 'none' : '1px solid var(--border)', backgroundColor: asaasForm.billing_type===val ? '#E8FF00' : 'transparent', color: asaasForm.billing_type===val ? '#0A0A0A' : 'var(--text-2)', cursor:'pointer', minWidth:70 }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </MField>
                {asaasForm.billing_type === 'CREDIT_CARD' && (MAX_INSTALLMENTS[asaasStudent?.plan_type] ?? 1) > 1 && (
                  <MField label="Parcelas">
                    <select value={asaasForm.installment_count} onChange={e => setAsaasForm(p => ({ ...p, installment_count: parseInt(e.target.value) }))} style={inputStyle}>
                      {Array.from({ length: MAX_INSTALLMENTS[asaasStudent!.plan_type] }, (_, i) => i + 1).map(n => {
                        const amt = parseFloat(asaasForm.amount) || 0
                        return (
                          <option key={n} value={n}>
                            {n === 1 ? 'À vista' : `${n}x${amt > 0 ? ` de R$${(amt / n).toFixed(2).replace('.', ',')}` : ''}`}
                          </option>
                        )
                      })}
                    </select>
                  </MField>
                )}
                <MField label="Valor (R$) *">
                  <input type="number" step="0.01" min="0" value={asaasForm.amount} onChange={e => setAsaasForm(p => ({ ...p, amount:e.target.value }))} placeholder="0,00" style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
                </MField>
                <MField label="Vencimento">
                  <input type="date" value={asaasForm.due_date} onChange={e => setAsaasForm(p => ({ ...p, due_date:e.target.value }))} style={inputStyle} />
                </MField>
                <MField label="CPF do aluno (se não cadastrado)">
                  <input type="text" value={asaasForm.cpf} onChange={e => setAsaasForm(p => ({ ...p, cpf:e.target.value }))} placeholder="000.000.000-00" style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
                </MField>
                {asaasError && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{asaasError}</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <MBtn onClick={() => setShowAsaas(false)}>Cancelar</MBtn>
                  <MBtn primary onClick={handleAsaas} disabled={asaasSaving} style={{ flex:2 }}>
                    {asaasSaving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><Zap size={14} /> Gerar Cobrança</>}
                  </MBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StudentCard({ student, onHistory, onAsaas, onManual, onSub, onUnblock, isHistoryActive }: { student:StudentPayment; onHistory:()=>void; onAsaas:()=>void; onManual:()=>void; onSub:()=>void; onUnblock:()=>void; isHistoryActive:boolean }) {
  const [hovered, setHovered] = useState(false)
  const color = STATUS_COLOR[student.payment_status] || 'var(--text-2)'
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', backgroundColor: hovered ? 'var(--surface-hover)' : 'var(--surface)', borderRadius:14, border: isHistoryActive ? '1px solid rgba(232,255,0,0.3)' : '1px solid var(--border)', padding:14, transition:'background-color 0.15s' }}>
      <div style={{ width:44, height:44, borderRadius:22, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginRight:12, fontSize:18, fontWeight:800, color:'#0A0A0A' }}>
        {student.name.charAt(0)}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>{student.name}</p>
        <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{student.email}</p>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
          <div style={{ width:6, height:6, borderRadius:3, backgroundColor:color, flexShrink:0 }} />
          <span style={{ fontSize:11, fontWeight:600, color }}>{STATUS_LABEL[student.payment_status]}</span>
          <span style={{ fontSize:11, color:'var(--text-3)' }}>·</span>
          <span style={{ fontSize:11, color:'var(--text-2)' }}>{PLAN_LABEL[student.plan_type]}</span>
          <span style={{ fontSize:11, color:'var(--text-3)' }}>·</span>
          <span style={{ fontSize:11, color:'var(--text-2)' }}>até {new Date(student.plan_end).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <IconBtn onClick={onHistory} title="Histórico"><History size={15} /></IconBtn>
        {student.payment_status === 'blocked' ? (
          <TextBtn onClick={onUnblock} primary><ShieldCheck size={12} /> Reativar</TextBtn>
        ) : (
          <>
            <TextBtn onClick={onAsaas} primary><Zap size={12} /> Cobrar</TextBtn>
            <TextBtn onClick={onSub}><RefreshCw size={12} /> Assinar</TextBtn>
            <TextBtn onClick={onManual}><Plus size={12} /> Manual</TextBtn>
          </>
        )}
      </div>
    </div>
  )
}

function FilterBtn({ label, count, active, onClick }: { label:string; count:number; active:boolean; onClick:()=>void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', gap:4, padding:'7px 12px', borderRadius:8, fontSize:12, fontWeight:600, border:'none', whiteSpace:'nowrap', cursor:'pointer', backgroundColor: active ? '#E8FF00' : (hovered ? 'var(--surface)' : 'transparent'), color: active ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)'), transition:'all 0.15s' }}>
      {label}<span style={{ fontSize:10, color: active ? 'rgba(10,10,10,0.5)' : 'var(--text-3)' }}>{count}</span>
    </button>
  )
}

function IconBtn({ onClick, title, children }: { onClick:()=>void; title:string; children:React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ padding:7, color: hovered ? 'var(--text)' : 'var(--text-2)', background:'none', border:'none', cursor:'pointer', borderRadius:8, backgroundColor: hovered ? 'var(--surface)' : 'transparent' }}>
      {children}
    </button>
  )
}

function TextBtn({ onClick, primary, children }: { onClick:()=>void; primary?:boolean; children:React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', backgroundColor: primary ? '#E8FF00' : (hovered ? 'var(--surface)' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)'), transition:'all 0.15s' }}>
      {children}
    </button>
  )
}

function MField({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function MBtn({ children, onClick, primary, disabled, style: extra }: { children:React.ReactNode; onClick?:()=>void; primary?:boolean; disabled?:boolean; style?:React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'12px 16px', borderRadius:12, fontSize:13, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid var(--border)', backgroundColor: primary ? '#E8FF00' : (hovered ? 'var(--surface-hover)' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)'), opacity: disabled ? 0.5 : 1, transition:'all 0.15s', ...extra }}>
      {children}
    </button>
  )
}
