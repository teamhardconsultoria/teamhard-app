import { useEffect, useState } from 'react'
import { Plus, X, Check, History, Zap, Copy, ExternalLink, ChevronLeft, Trash2, RefreshCw, Link, ShieldCheck, Calendar } from 'lucide-react'
import { sendAutoMessage } from '../../lib/autoMessage'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface StudentPayment { id:string; name:string; email:string; plan_type:string; payment_status:string; plan_end:string; plan_start:string }
interface Payment {
  id:string; amount:number; status:string; payment_method?:string; due_date:string; paid_at?:string;
  plan_type:string; created_at:string; source:string; installment_number?:number; total_installments?:number
}
interface AgendaItem {
  id:string; student_id:string; student_name:string; amount:number; due_date:string;
  plan_type:string; status:string; installment_number:number; total_installments:number
}

const STATUS_COLOR: Record<string, string> = { active:'#00C853', pending:'#FF9800', overdue:'#FF4444', blocked:'#FF4444' }
const STATUS_LABEL: Record<string, string> = { active:'Em dia', pending:'Pendente', overdue:'Vencido', blocked:'Bloqueado' }
const PLAN_LABEL: Record<string, string> = { monthly:'Mensal', quarterly:'Trimestral', semiannual:'Semestral', annual:'Anual', permuta:'Permuta' }
const PLAN_MONTHS: Record<string, number> = { monthly:1, quarterly:3, semiannual:6, annual:12, permuta:0 }
const METHODS = ['PIX','PIX automático','Boleto','Cartão de débito','Crédito à vista','Crédito recorrente','Crédito 3x','Dinheiro','Transferência']
const emptyForm = { amount:'', payment_method:'PIX', due_date: new Date().toISOString().split('T')[0], paid_at: new Date().toISOString().split('T')[0] }
const emptySub = { amount:'', billing_type:'CREDIT_CARD', due_date: new Date().toISOString().split('T')[0], cpf:'' }
const MAX_INSTALLMENTS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
const PLAN_DEFAULTS: Record<string, number> = { monthly: 397, quarterly: 741 }
type Filter = 'all'|'active'|'pending'|'overdue'|'blocked'
const spin = { width:20, height:20, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }
const inputStyle = { width:'100%', padding:'11px 14px', backgroundColor:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const }
const labelStyle = { fontSize:11, color:'var(--text-2)', textTransform:'uppercase' as const, letterSpacing:1 }
const formatDate = (d:string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
const formatMoney = (n:number) => n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

function computeSchedulePreview(planStart: string, planType: string) {
  const months = PLAN_MONTHS[planType] || 1
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const result: { installment: number; date: string }[] = []
  for (let i = 1; i <= months; i++) {
    const d = new Date(planStart + 'T12:00:00')
    d.setMonth(d.getMonth() + (i - 1))
    if (d >= today) result.push({ installment: i, date: d.toISOString().split('T')[0] })
  }
  return result
}

export default function Payments() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentPayment[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'students'|'agenda'>('students')
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [loadingAgenda, setLoadingAgenda] = useState(false)
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
  const [asaasOpenChargesCount, setAsaasOpenChargesCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showSub, setShowSub] = useState(false)
  const [subStudent, setSubStudent] = useState<StudentPayment | null>(null)
  const [subForm, setSubForm] = useState(emptySub)
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState('')
  const [subResult, setSubResult] = useState<{ paymentLink?:string } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleStudent, setScheduleStudent] = useState<StudentPayment | null>(null)
  const [scheduleForm, setScheduleForm] = useState({ amount_per_inst: '' })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)
    await loadStudents(coach.id)
    setLoading(false)
  }

  const loadStudents = async (cId: string) => {
    const { data } = await supabase.from('students').select('id, plan_type, payment_status, plan_start, plan_end, user:users(name, email)').eq('coach_id', cId).order('created_at', { ascending: false })
    setStudents((data || []).map((s: any) => ({ id:s.id, name:s.user.name, email:s.user.email, plan_type:s.plan_type, payment_status:s.payment_status, plan_start:s.plan_start, plan_end:s.plan_end })))
  }

  const loadAgenda = async () => {
    setLoadingAgenda(true)
    const { data } = await supabase
      .from('payments')
      .select('id, student_id, amount, due_date, plan_type, status, installment_number, total_installments, student:students(user:users(name))')
      .eq('source', 'scheduled')
      .in('status', ['pending', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(300)
    setAgenda((data || []).map((p: any) => ({
      id: p.id,
      student_id: p.student_id,
      student_name: p.student?.user?.name || '—',
      amount: p.amount,
      due_date: p.due_date,
      plan_type: p.plan_type,
      status: p.status,
      installment_number: p.installment_number ?? 1,
      total_installments: p.total_installments ?? 1,
    })))
    setLoadingAgenda(false)
  }

  const openHistory = async (student: StudentPayment) => {
    setHistoryStudent(student); setLoadingHistory(true)
    // Tenta selecionar colunas da migration 020; se ainda não existirem, cai no fallback
    let { data, error } = await supabase.from('payments')
      .select('id, amount, status, payment_method, due_date, paid_at, plan_type, created_at, source, installment_number, total_installments')
      .eq('student_id', student.id)
      .order('due_date', { ascending: false })
    if (error) {
      // Fallback: busca sem as colunas novas (migration 020 ainda não aplicada)
      const fallback = await supabase.from('payments')
        .select('id, amount, status, payment_method, due_date, paid_at, plan_type, created_at')
        .eq('student_id', student.id)
        .order('due_date', { ascending: false })
      data = (fallback.data || []).map((p: any) => ({ ...p, source: 'manual' }))
    }
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
      const months = PLAN_MONTHS[modalStudent.plan_type] || 1
      // plan_start do novo período = vencimento do período anterior
      const newPlanStart = modalStudent.plan_end
      await supabase.from('payments').insert({ student_id:modalStudent.id, amount:parseFloat(form.amount), status:'paid', payment_method:form.payment_method, due_date:form.due_date, paid_at:form.paid_at, plan_type:modalStudent.plan_type })
      await supabase.from('students').update({ payment_status:'active', plan_end:newPlanEnd, plan_start:newPlanStart }).eq('id', modalStudent.id)
      // Gera cronograma do novo período (a partir do novo plan_start)
      await supabase.rpc('generate_payment_schedule', {
        p_student_id: modalStudent.id,
        p_plan_end: newPlanEnd,
        p_plan_type: modalStudent.plan_type,
        p_amount_per_inst: parseFloat(form.amount) / months,
      })
      setShowModal(false)
      await loadStudents(coachId)
      if (historyStudent?.id === modalStudent.id) await openHistory(modalStudent)
      if (activeTab === 'agenda') await loadAgenda()
    } catch (err: any) { setError(err.message || 'Erro ao registrar.') } finally { setSaving(false) }
  }

  const handleGenerateSchedule = async () => {
    if (!scheduleForm.amount_per_inst || !scheduleStudent) { setScheduleError('Preencha o valor por parcela.'); return }
    setScheduleSaving(true); setScheduleError('')
    const { error: rpcError } = await supabase.rpc('generate_payment_schedule', {
      p_student_id: scheduleStudent.id,
      p_plan_end: scheduleStudent.plan_end,
      p_plan_type: scheduleStudent.plan_type,
      p_amount_per_inst: parseFloat(scheduleForm.amount_per_inst),
    })
    if (rpcError) { setScheduleError(rpcError.message); setScheduleSaving(false); return }
    setShowScheduleModal(false)
    if (historyStudent?.id === scheduleStudent.id) await openHistory(scheduleStudent)
    if (activeTab === 'agenda') await loadAgenda()
    setScheduleSaving(false)
  }

  const handleMarkPaid = async (payment: Payment) => {
    setMarkingPaidId(payment.id)
    await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payment.id)
    setHistory(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'paid', paid_at: new Date().toISOString() } : p))
    if (activeTab === 'agenda') await loadAgenda()
    setMarkingPaidId(null)
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
    if (activeTab === 'agenda') await loadAgenda()
    setDeletingId(null)
  }

  const openAsaasModal = (student: StudentPayment) => {
    setAsaasStudent(student)
    setAsaasForm({ amount:'', billing_type:'PIX', due_date: new Date().toISOString().split('T')[0], cpf:'', installment_count: 1 })
    setAsaasResult(null)
    setAsaasError('')
    setAsaasOpenChargesCount(0)
    setShowAsaas(true)
    supabase.from('payments').select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .not('asaas_charge_id', 'is', null)
      .in('status', ['pending', 'overdue'])
      .then(({ count }) => setAsaasOpenChargesCount(count || 0))
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
  const agendaOverdueCount = agenda.filter(a => a.status === 'overdue').length

  // Agrupa agenda por mês para exibição
  const agendaByMonth: [string, AgendaItem[]][] = []
  const monthMap: Record<string, AgendaItem[]> = {}
  agenda.forEach(item => {
    const key = item.due_date.slice(0, 7)
    if (!monthMap[key]) { monthMap[key] = []; agendaByMonth.push([key, monthMap[key]]) }
    monthMap[key].push(item)
  })

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', backgroundColor:'var(--bg)' }}>
      {/* Painel principal */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
        <div style={{ padding: isMobile ? '16px 16px 0' : '20px 24px 0', flexShrink:0 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:0 }}>Pagamentos</h1>
          <p style={{ fontSize:12, color:'var(--text-2)', margin:'4px 0 12px 0' }}>{students.length} aluno{students.length !== 1 ? 's' : ''}</p>
          {/* Tabs */}
          <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)' }}>
            <TabBtn label="Alunos" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
            <TabBtn
              label="Agenda"
              active={activeTab === 'agenda'}
              badge={agendaOverdueCount > 0 ? agendaOverdueCount : undefined}
              onClick={() => { setActiveTab('agenda'); if (agenda.length === 0) loadAgenda() }}
            />
          </div>
        </div>

        {/* Filtros — só na aba Alunos */}
        {activeTab === 'students' && (
          <div style={{ display:'flex', gap:6, padding:'10px 24px', borderBottom:'1px solid var(--border)', flexShrink:0, overflowX:'auto' }}>
            {([['all','Todos'],['active','Em dia'],['pending','Pendente'],['overdue','Vencido'],['blocked','Bloqueado']] as [Filter,string][]).map(([key, label]) => (
              <FilterBtn key={key} label={label} count={counts[key]} active={filter === key} onClick={() => setFilter(key)} />
            ))}
          </div>
        )}

        {/* Conteúdo */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {activeTab === 'students' ? (
            loading ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div style={spin} /></div>
            ) : filtered.length === 0 ? (
              <p style={{ textAlign:'center', color:'var(--text-2)', fontSize:14, paddingTop:60 }}>Nenhum aluno neste filtro.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:700 }}>
                {filtered.map(student => (
                  <StudentCard key={student.id} student={student}
                    onHistory={() => openHistory(student)}
                    onAsaas={() => openAsaasModal(student)}
                    onManual={() => { setModalStudent(student); setForm(emptyForm); setError(''); setShowModal(true) }}
                    onSub={() => { setSubStudent(student); setSubForm(emptySub); setSubResult(null); setSubError(''); setShowSub(true) }}
                    onUnblock={() => handleUnblock(student)}
                    isHistoryActive={historyStudent?.id === student.id}
                  />
                ))}
              </div>
            )
          ) : (
            /* Aba Agenda */
            loadingAgenda ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div style={spin} /></div>
            ) : agenda.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:60, gap:12 }}>
                <Calendar size={36} color="var(--text-3)" />
                <p style={{ color:'var(--text-2)', fontSize:14, textAlign:'center', margin:0 }}>Nenhum vencimento agendado.</p>
                <p style={{ color:'var(--text-3)', fontSize:12, textAlign:'center', margin:0, maxWidth:280 }}>Registre um pagamento manual para gerar automaticamente o cronograma do próximo período.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:24, maxWidth:700 }}>
                {agendaByMonth.map(([monthKey, items]) => (
                  <div key={monthKey}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:1, margin:'0 0 10px 0' }}>
                      {new Date(monthKey + '-15').toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}
                    </p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {items.map(item => {
                        const isOverdue = item.status === 'overdue'
                        const student = students.find(s => s.id === item.student_id)
                        return (
                          <div key={item.id} onClick={() => student && openHistory(student)}
                            style={{ display:'flex', alignItems:'center', gap:12, backgroundColor:'var(--surface)', border:`1px solid ${isOverdue ? 'rgba(255,68,68,0.3)' : 'var(--border)'}`, borderRadius:12, padding:'12px 14px', cursor: student ? 'pointer' : 'default', transition:'background-color 0.15s' }}
                            onMouseEnter={e => student && ((e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--surface-hover)')}
                            onMouseLeave={e => student && ((e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--surface)')}>
                            <div style={{ width:36, height:36, borderRadius:18, backgroundColor: isOverdue ? 'rgba(255,68,68,0.12)' : 'rgba(100,160,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <Calendar size={16} color={isOverdue ? '#FF4444' : '#64A0FF'} />
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <p style={{ fontSize:13, fontWeight:700, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.student_name}</p>
                              <p style={{ fontSize:11, color:'var(--text-2)', margin:'2px 0 0 0' }}>
                                Parcela {item.installment_number}/{item.total_installments} · {PLAN_LABEL[item.plan_type]}
                              </p>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{formatMoney(item.amount)}</p>
                              <p style={{ fontSize:11, fontWeight:600, color: isOverdue ? '#FF4444' : '#FF9800', margin:'2px 0 0 0' }}>
                                {isOverdue ? 'Vencido' : 'Vence'} {formatDate(item.due_date)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Painel de histórico */}
      {historyStudent && (
        <div style={isMobile
          ? { position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', backgroundColor:'var(--bg)' }
          : { width:300, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', flexShrink:0, backgroundColor:'var(--bg)' }
        }>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={() => setHistoryStudent(null)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:2 }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{historyStudent.name}</p>
              <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>Histórico de pagamentos</p>
            </div>
            <button
              onClick={() => { setScheduleStudent(historyStudent); setScheduleForm({ amount_per_inst: '' }); setScheduleError(''); setShowScheduleModal(true) }}
              title="Gerar cronograma de vencimentos"
              style={{ padding:6, background:'none', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--text-2)', display:'flex', alignItems:'center' }}>
              <Calendar size={14} />
            </button>
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
                {history.map(p => {
                  const isScheduled = p.source === 'scheduled'
                  const isPendingScheduled = isScheduled && (p.status === 'pending' || p.status === 'overdue')
                  const badgeColor = p.status === 'paid' ? '#00C853' : p.status === 'overdue' ? '#FF4444' : isScheduled ? '#64A0FF' : '#FF9800'
                  const badgeBg = p.status === 'paid' ? 'rgba(0,200,83,0.1)' : p.status === 'overdue' ? 'rgba(255,68,68,0.1)' : isScheduled ? 'rgba(100,160,255,0.1)' : 'rgba(255,152,0,0.1)'
                  const badgeLabel = p.status === 'paid' ? 'Pago' : p.status === 'overdue' ? 'Vencido' : isScheduled ? 'Agendado' : 'Pendente'
                  return (
                    <div key={p.id} style={{ backgroundColor:'var(--surface)', border:`1px solid ${p.status === 'overdue' ? 'rgba(255,68,68,0.25)' : 'var(--border)'}`, borderRadius:12, padding:14 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <span style={{ fontSize:16, fontWeight:900, color:'var(--text)' }}>{formatMoney(p.amount)}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:20, backgroundColor: badgeBg, color: badgeColor }}>
                            {badgeLabel}
                          </span>
                          {isPendingScheduled && (
                            <button onClick={() => handleMarkPaid(p)} disabled={markingPaidId === p.id} title="Marcar como pago"
                              style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:5, background:'none', border:'none', cursor: markingPaidId === p.id ? 'not-allowed' : 'pointer', color:'#00C853', opacity: markingPaidId === p.id ? 0.4 : 1, borderRadius:6 }}>
                              <Check size={13} />
                            </button>
                          )}
                          <button onClick={() => handleDeletePayment(p.id)} disabled={deletingId === p.id} title="Excluir cobrança"
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:5, background:'none', border:'none', cursor: deletingId === p.id ? 'not-allowed' : 'pointer', color:'#FF4444', opacity: deletingId === p.id ? 0.4 : 1, borderRadius:6 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {isScheduled && p.installment_number != null && (
                        <p style={{ fontSize:11, color:'#64A0FF', margin:'0 0 4px 0', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                          <Calendar size={10} /> Parcela {p.installment_number}/{p.total_installments}
                        </p>
                      )}
                      <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Vencimento: <span style={{ color:'var(--text)' }}>{formatDate(p.due_date)}</span></p>
                      {p.paid_at && <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Pago em: <span style={{ color:'#00C853' }}>{formatDate(p.paid_at)}</span></p>}
                      {p.payment_method && <p style={{ fontSize:12, color:'var(--text-2)', margin:'0 0 2px 0' }}>Método: <span style={{ color:'var(--text)' }}>{p.payment_method}</span></p>}
                      <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{PLAN_LABEL[p.plan_type]}</p>
                    </div>
                  )
                })}
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
              <MField label="Valor total do período (R$) *">
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
                <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>
                  Plano renovado por <span style={{ color:'var(--text)', fontWeight:600 }}>{PLAN_MONTHS[modalStudent.plan_type]} {PLAN_MONTHS[modalStudent.plan_type] === 1 ? 'mês' : 'meses'}</span>.
                  {PLAN_MONTHS[modalStudent.plan_type] > 1 && form.amount && parseFloat(form.amount) > 0 && (
                    <> Cronograma gerado: {PLAN_MONTHS[modalStudent.plan_type]}x de <span style={{ color:'#E8FF00', fontWeight:600 }}>{formatMoney(parseFloat(form.amount) / PLAN_MONTHS[modalStudent.plan_type])}</span>.</>
                  )}
                </p>
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

      {/* Modal Cronograma */}
      {showScheduleModal && scheduleStudent && (() => {
        const preview = scheduleForm.amount_per_inst && parseFloat(scheduleForm.amount_per_inst) > 0
          ? computeSchedulePreview(scheduleStudent.plan_start, scheduleStudent.plan_type)
          : []
        return (
          <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
            <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth:420 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
                <div>
                  <h2 style={{ fontSize:16, fontWeight:900, color:'var(--text)', margin:0 }}>Gerar Cronograma</h2>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{scheduleStudent.name} · {PLAN_LABEL[scheduleStudent.plan_type]}</p>
                </div>
                <button onClick={() => setShowScheduleModal(false)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:4 }}><X size={18} /></button>
              </div>
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                <MField label="Valor por parcela (R$) *">
                  <input type="number" step="0.01" min="0" value={scheduleForm.amount_per_inst}
                    onChange={e => setScheduleForm(p => ({ ...p, amount_per_inst: e.target.value }))}
                    placeholder="0,00" style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor='#E8FF00')}
                    onBlur={e => (e.currentTarget.style.borderColor='var(--border)')} />
                </MField>
                {preview.length > 0 && (
                  <div style={{ backgroundColor:'rgba(100,160,255,0.05)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:10, padding:'10px 14px' }}>
                    <p style={{ fontSize:11, color:'#64A0FF', fontWeight:700, textTransform:'uppercase', letterSpacing:1, margin:'0 0 10px 0' }}>Parcelas a gerar</p>
                    {preview.map(item => (
                      <div key={item.installment} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:12, color:'var(--text-2)' }}>Parcela {item.installment}/{PLAN_MONTHS[scheduleStudent.plan_type]}</span>
                        <span style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>
                          {formatDate(item.date)} · {formatMoney(parseFloat(scheduleForm.amount_per_inst))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {scheduleForm.amount_per_inst && parseFloat(scheduleForm.amount_per_inst) > 0 && preview.length === 0 && (
                  <p style={{ fontSize:12, color:'var(--text-3)', margin:0, textAlign:'center' }}>Todas as parcelas já venceram. Verifique o vencimento do plano.</p>
                )}
                <div style={{ backgroundColor:'rgba(232,255,0,0.05)', border:'1px solid rgba(232,255,0,0.15)', borderRadius:10, padding:'10px 12px' }}>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>
                    Parcelas mensais a partir de <span style={{ color:'var(--text)', fontWeight:600 }}>{formatDate(scheduleStudent.plan_start)}</span>, plano até <span style={{ color:'var(--text)', fontWeight:600 }}>{formatDate(scheduleStudent.plan_end)}</span>.
                    Parcelas futuras pendentes existentes serão substituídas.
                  </p>
                </div>
                {scheduleError && <p style={{ color:'#FF4444', fontSize:12, margin:0 }}>{scheduleError}</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <MBtn onClick={() => setShowScheduleModal(false)}>Cancelar</MBtn>
                  <MBtn primary onClick={handleGenerateSchedule} disabled={scheduleSaving} style={{ flex:2 }}>
                    {scheduleSaving ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <><Calendar size={14} /> Gerar Cronograma</>}
                  </MBtn>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
                {asaasResult.bankSlipUrl && (
                  <a href={asaasResult.bankSlipUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'12px 16px', backgroundColor:'#E8FF00', color:'#0A0A0A', borderRadius:12, fontSize:13, fontWeight:700, textDecoration:'none' }}>
                    <ExternalLink size={15} /> Abrir Boleto
                  </a>
                )}
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
                {asaasOpenChargesCount > 0 && (
                  <div style={{ backgroundColor:'rgba(255,152,0,0.08)', border:'1px solid rgba(255,152,0,0.35)', borderRadius:10, padding:'10px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ fontSize:16, lineHeight:'1.4', flexShrink:0 }}>⚠️</span>
                    <p style={{ fontSize:12, color:'var(--text)', margin:0, lineHeight:'1.5' }}>
                      <strong style={{ color:'#FF9800' }}>Atenção:</strong> este aluno já tem <strong>{asaasOpenChargesCount}</strong> cobrança{asaasOpenChargesCount !== 1 ? 's' : ''} em aberto no Asaas. Criar outra pode gerar notificações duplicadas ao aluno.
                    </p>
                  </div>
                )}
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
          <span style={{ fontSize:11, color:'var(--text-2)' }}>até {new Date(student.plan_end + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <IconBtn onClick={onHistory} title="Histórico"><History size={15} /></IconBtn>
        {student.plan_type === 'permuta' ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, backgroundColor: 'rgba(100,160,255,0.12)', color: '#64A0FF' }}>Permuta</span>
        ) : student.payment_status === 'blocked' ? (
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

function TabBtn({ label, active, badge, onClick }: { label:string; active:boolean; badge?:number; onClick:()=>void }) {
  return (
    <button onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', background:'transparent',
        color: active ? 'var(--text)' : 'var(--text-2)',
        borderBottom: active ? '2px solid #E8FF00' : '2px solid transparent',
        marginBottom: -1,
      }}>
      {label}
      {badge !== undefined && (
        <span style={{ fontSize:10, backgroundColor:'#FF4444', color:'white', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>{badge}</span>
      )}
    </button>
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
