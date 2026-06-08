import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight, X, Copy, Check, MessageCircle, ArrowLeftRight, UserCheck, UserX, AlertCircle, ClipboardList, RefreshCw, Cake } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface StudentRow {
  id: string
  coach_id?: string
  user: { name: string; email: string }
  coaches?: { users: { name: string } }
  plan_type: string
  payment_status: string
  plan_end: string
}

interface CoachOption {
  id: string
  name: string
}

interface StudentCards {
  active: number
  pendingUpdate: number
  noAssessment: number
  overdue: number
  birthdays: { id: string; name: string }[]
  inactive: number
}

const STATUS_COLOR: Record<string, string> = {
  active: '#00C853', pending: '#FF9800', overdue: '#FF9800', blocked: '#FF4444',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo', pending: 'Pendente', overdue: 'Em atraso', blocked: 'Bloqueado',
}
const PLAN_LABEL: Record<string, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', permuta: 'Permuta', legado: 'Legado',
}
const PLAN_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, permuta: 12, legado: 6 }
const PLAN_DEFAULTS: Record<string, number> = { monthly: 397, quarterly: 741 }

function calcPlanEnd(start: string, planType: string): string {
  const d = new Date(start + 'T12:00:00')
  d.setMonth(d.getMonth() + (PLAN_MONTHS[planType] || 1))
  return d.toISOString().split('T')[0]
}

function getInstallmentCount(paymentMethod: string, planType: string, creditInstallments: number): number {
  if (paymentMethod === 'subscription' || paymentMethod === 'pix_auto') return PLAN_MONTHS[planType] || 1
  if (paymentMethod === 'credit') return creditInstallments
  return 1
}

const emptyForm = {
  name: '', email: '', phone: '',
  plan_type: 'monthly', plan_start: new Date().toISOString().split('T')[0],
  payment_method: 'pix', amount: '397.00', installment_count: 1, discount: '0',
  cpf: '', address: '', cep: '',
}

export default function Students() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isSuperAdmin = user?.role === 'super_admin'
  const isMobile = useIsMobile()

  const [students, setStudents] = useState<StudentRow[]>([])
  const [filtered, setFiltered] = useState<StudentRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<StudentCards | null>(null)

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [createdPassword, setCreatedPassword] = useState('')
  const [createdPhone, setCreatedPhone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null)
  const [contractSending, setContractSending] = useState(false)
  const [contractLink, setContractLink] = useState('')
  const [contractError, setContractError] = useState('')

  // Migrate modal (super_admin only)
  const [migrateStudent, setMigrateStudent] = useState<StudentRow | null>(null)
  const [allCoaches, setAllCoaches] = useState<CoachOption[]>([])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [migrateError, setMigrateError] = useState('')

  useEffect(() => { fetchStudents() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(students.filter(s => {
      const matchStudent = s.user.name.toLowerCase().includes(q) || s.user.email.toLowerCase().includes(q)
      const matchCoach = isSuperAdmin ? (s.coaches?.users?.name ?? '').toLowerCase().includes(q) : false
      return matchStudent || matchCoach
    }))
  }, [search, students])

  const fetchStudents = async () => {
    if (isSuperAdmin) {
      const [{ data: studentsData, error: studentsErr }, { data: coachesData }] = await Promise.all([
        supabase
          .from('students')
          .select('id, plan_type, payment_status, plan_end, coach_id, user:users!students_user_id_fkey(name, email)')
          .order('created_at', { ascending: false }),
        supabase
          .from('coaches')
          .select('id, users!coaches_user_id_fkey(name)'),
      ])

      if (studentsErr) {
        console.error('fetchStudents (super_admin):', studentsErr.message)
        setLoading(false)
        return
      }

      const coachNameMap: Record<string, string> = {}
      ;(coachesData ?? []).forEach((c: any) => {
        coachNameMap[c.id] = c.users?.name ?? '—'
      })

      const enriched = (studentsData ?? []).map((s: any) => ({
        ...s,
        coaches: { users: { name: coachNameMap[s.coach_id] ?? '—' } },
      }))

      setStudents(enriched as any)
      setFiltered(enriched as any)
      setLoading(false)
      return
    }

    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    const { data } = await supabase
      .from('students')
      .select('id, plan_type, payment_status, plan_end, birth_date, user:users(name, email)')
      .eq('coach_id', coach.id)
      .order('created_at', { ascending: false })
    const list = (data as any) ?? []
    setStudents(list)
    setFiltered(list)

    const ids: string[] = list.map((s: any) => s.id)
    if (ids.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      const todayMD = new Date().toISOString().split('T')[0].slice(5)
      const [workoutsRes, dietsRes, assessmentsRes] = await Promise.all([
        supabase.from('workouts').select('student_id').in('student_id', ids),
        supabase.from('diets').select('student_id').in('student_id', ids),
        supabase.from('assessments').select('student_id').in('student_id', ids).gte('created_at', thirtyDaysAgo + 'T00:00:00'),
      ])
      const withWorkout = new Set(workoutsRes.data?.map((w: any) => w.student_id) || [])
      const withDiet = new Set(dietsRes.data?.map((d: any) => d.student_id) || [])
      const withRecentAssessment = new Set(assessmentsRes.data?.map((a: any) => a.student_id) || [])
      const active = list.filter((s: any) => s.payment_status === 'active')
      setCards({
        active: active.length,
        pendingUpdate: active.filter((s: any) => !withWorkout.has(s.id) || !withDiet.has(s.id)).length,
        noAssessment: active.filter((s: any) => !withRecentAssessment.has(s.id)).length,
        overdue: list.filter((s: any) => s.payment_status === 'overdue').length,
        birthdays: list.filter((s: any) => s.birth_date && String(s.birth_date).slice(5) === todayMD).map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' })),
        inactive: list.filter((s: any) => s.payment_status === 'blocked').length,
      })
    } else {
      setCards({ active: 0, pendingUpdate: 0, noAssessment: 0, overdue: 0, birthdays: [], inactive: 0 })
    }
    setLoading(false)
  }

  const openModal = () => {
    setForm(emptyForm); setCreatedPassword(''); setCreatedPhone(null); setError(''); setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false); setCreatedPassword(''); setCreatedPhone(null); setError('')
    setCreatedStudentId(null); setContractLink(''); setContractError('')
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Nome e e-mail são obrigatórios.'); return }
    setError(''); setSaving(true)
    try {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      if (!coach) { setError('Perfil de coach não encontrado.'); return }
      const { data, error: fnError } = await supabase.functions.invoke('create-student', {
        body: {
          name: form.name.trim(), email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null, plan_type: form.plan_type,
          plan_start: form.plan_start, coach_id: coach.id,
        },
      })
      if (fnError) {
        let msg = 'Erro ao criar aluno.'
        try {
          const body = await (fnError as any).context?.json?.()
          if (body?.error) msg = body.error
          else if (body?.message) msg = body.message
        } catch {}
        setError(msg)
        return
      }
      if (data?.error) { setError(data.error); return }

      // Gera cronograma de parcelas se valor informado
      if (form.amount && parseFloat(form.amount) > 0 && data.student_id) {
        const totalInst = getInstallmentCount(form.payment_method, form.plan_type, form.installment_count)
        await supabase.rpc('generate_payment_schedule', {
          p_student_id: data.student_id,
          p_plan_end: calcPlanEnd(form.plan_start, form.plan_type),
          p_plan_type: form.plan_type,
          p_amount_per_inst: parseFloat(form.amount) / totalInst,
          p_total_installments: totalInst,
        })
      }

      setCreatedPassword(data.tempPassword)
      setCreatedStudentId(data.student_id || null)
      setCreatedPhone(data.phone || form.phone.trim() || null)
      supabase.from('activity_logs').insert({ coach_id: coach.id, action_type: 'created_student', details: { student_name: form.name.trim(), email: form.email.trim() } })
      fetchStudents()
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.')
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(
      `Olá ${form.name}! Seu acesso ao Método Acelera!:\nE-mail: ${form.email}\nSenha provisória: ${createdPassword}\nBaixe o app e faça login.`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendContract = async () => {
    setContractSending(true); setContractError('')
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('send-contract', {
        body: { student_id: createdStudentId, name: form.name, email: form.email, cpf: form.cpf, address: form.address, cep: form.cep },
      })
      if (fnErr || res?.error) { setContractError(res?.error || fnErr?.message || 'Erro ao enviar contrato.'); return }
      if (res?.link) {
        setContractLink(res.link)
      } else if (res?.pdf_base64) {
        const bytes = Uint8Array.from(atob(res.pdf_base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'contrato_team_hard.pdf'; a.click()
        URL.revokeObjectURL(url)
        setContractLink('downloaded')
      }
    } catch (e: any) {
      setContractError(e.message || 'Erro inesperado.')
    } finally {
      setContractSending(false)
    }
  }

  const openMigrate = async (e: React.MouseEvent, student: StudentRow) => {
    e.stopPropagation()
    setMigrateStudent(student)
    setSelectedCoachId(student.coach_id ?? '')
    setMigrateError('')
    if (allCoaches.length === 0) {
      const { data } = await supabase.from('coaches').select('id, users!coaches_user_id_fkey(name)').order('created_at')
      setAllCoaches(((data ?? []) as any[]).map(c => ({ id: c.id, name: c.users?.name ?? 'Sem nome' })))
    }
  }

  const handleMigrate = async () => {
    if (!migrateStudent || !selectedCoachId) return
    if (selectedCoachId === migrateStudent.coach_id) { setMigrateStudent(null); return }
    setMigrating(true)
    setMigrateError('')
    const { error: updateError } = await supabase
      .from('students')
      .update({ coach_id: selectedCoachId })
      .eq('id', migrateStudent.id)
    if (updateError) {
      setMigrateError('Erro ao migrar aluno. Tente novamente.')
      setMigrating(false)
      return
    }
    setMigrating(false)
    setMigrateStudent(null)
    fetchStudents()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: isMobile ? '20px 16px 48px' : '40px 32px 48px', maxWidth: isSuperAdmin ? 900 : 720 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Alunos</h1>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '2px 8px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{students.length}</span>
            </div>
            {isSuperAdmin && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#E8FF00', backgroundColor: 'rgba(232,255,0,0.1)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                Todos os treinadores
              </span>
            )}
          </div>
          <button
            onClick={openModal}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}
          >
            <Plus size={16} />
            Novo Aluno
          </button>
        </div>

        {/* Cards de resumo (apenas coach) */}
        {!isSuperAdmin && cards && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
            <SummaryCard icon={<UserCheck size={15} color="#00C853" />} value={cards.active} label="Alunos ativos" accent="#00C853" isGood />
            <SummaryCard icon={<RefreshCw size={15} color={cards.pendingUpdate > 0 ? '#FF9800' : 'var(--text-3)'} />} value={cards.pendingUpdate} label="Pendentes de atualização" accent={cards.pendingUpdate > 0 ? '#FF9800' : undefined} />
            <SummaryCard icon={<ClipboardList size={15} color={cards.noAssessment > 0 ? '#3B82F6' : 'var(--text-3)'} />} value={cards.noAssessment} label="Sem avaliação recente" accent={cards.noAssessment > 0 ? '#3B82F6' : undefined} />
            <SummaryCard icon={<Cake size={15} color={cards.birthdays.length > 0 ? '#FF9800' : 'var(--text-3)'} />} value={cards.birthdays.length} label="Aniversariantes hoje" sub={cards.birthdays.map(b => b.name.split(' ')[0]).join(', ') || undefined} accent={cards.birthdays.length > 0 ? '#FF9800' : undefined} />
            <SummaryCard icon={<UserX size={15} color={cards.inactive > 0 ? '#FF4444' : 'var(--text-3)'} />} value={cards.inactive} label="Alunos inativos" accent={cards.inactive > 0 ? '#FF4444' : undefined} isAlert={cards.inactive > 0} />
          </div>
        )}

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search size={16} color="#888" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder={isSuperAdmin ? 'Buscar por nome, e-mail ou treinador...' : 'Buscar por nome ou e-mail...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-2)', fontSize: 14 }}>
            {search ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(student => (
              <StudentCard
                key={student.id}
                student={student}
                isSuperAdmin={isSuperAdmin}
                onClick={() => navigate(`/coach/students/${student.id}`)}
                onMigrate={isSuperAdmin ? (e) => openMigrate(e, student) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal: criar aluno */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
                {createdPassword ? 'Aluno criado!' : 'Novo Aluno'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {createdPassword ? (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.25)', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px 0' }}>Senha provisória</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-text)', letterSpacing: 4, margin: 0 }}>{createdPassword}</p>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                  Envie as credenciais para <span style={{ color: 'var(--text)', fontWeight: 600 }}>{form.name}</span>. No primeiro acesso, o aluno criará uma nova senha.
                </p>
                {createdPhone && (
                  <ModalBtn
                    primary
                    onClick={() => {
                      const digits = createdPhone.replace(/\D/g, '')
                      const firstName = form.name.split(' ')[0]
                      const msg = encodeURIComponent(
                        `Olá, ${firstName}! 💪 Seja bem-vindo(a) ao *Método Acelera!*!\n\nSeu acesso ao app foi criado:\n📧 E-mail: ${form.email}\n🔑 Senha provisória: *${createdPassword}*\n\nNo primeiro acesso você será solicitado(a) a criar uma nova senha.\n\n_Método Acelera! Consultoria Esportiva_`
                      )
                      window.open(`https://wa.me/${digits}?text=${msg}`, '_blank')
                    }}
                  >
                    <MessageCircle size={16} /> Enviar por WhatsApp
                  </ModalBtn>
                )}
                <ModalBtn primary={!createdPhone} onClick={copyPassword}>
                  {copied ? <><Check size={16} /> Copiado!</> : <><Copy size={16} /> Copiar credenciais</>}
                </ModalBtn>
                {contractLink === 'downloaded' ? (
                  <div style={{ backgroundColor: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                    <p style={{ fontSize: 13, color: '#00C853', fontWeight: 700, margin: 0 }}>Contrato baixado com sucesso!</p>
                  </div>
                ) : contractLink ? (
                  <div style={{ backgroundColor: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 13, color: '#00C853', fontWeight: 700, margin: 0 }}>Contrato enviado para assinatura!</p>
                    <a href={contractLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>Ver link do contrato</a>
                  </div>
                ) : (
                  <ModalBtn onClick={sendContract} disabled={contractSending}>
                    {contractSending
                      ? <div style={{ width: 16, height: 16, border: '2px solid #888', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      : 'Enviar Contrato para Assinatura'}
                  </ModalBtn>
                )}
                {contractError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{contractError}</p>}
                <ModalBtn onClick={closeModal}>Fechar</ModalBtn>
              </div>
            ) : (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ModalField label="Nome completo *">
                  <ModalInput placeholder="Nome do aluno" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
                </ModalField>
                <ModalField label="E-mail *">
                  <ModalInput type="email" placeholder="aluno@email.com" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />
                </ModalField>
                <ModalField label="WhatsApp">
                  <ModalInput type="tel" placeholder="+55 11 99999-9999" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
                </ModalField>
                <ModalField label="CPF">
                  <ModalInput placeholder="000.000.000-00" value={form.cpf} onChange={v => setForm(p => ({ ...p, cpf: v }))} />
                </ModalField>
                <ModalField label="Endereço">
                  <ModalInput placeholder="Rua, número, bairro, cidade/UF" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} />
                </ModalField>
                <ModalField label="CEP">
                  <ModalInput placeholder="00000-000" value={form.cep} onChange={v => setForm(p => ({ ...p, cep: v }))} />
                </ModalField>
                <div style={{ display: 'flex', gap: 12 }}>
                  <ModalField label="Plano">
                    <select
                      value={form.plan_type}
                      onChange={e => {
                        const pt = e.target.value
                        const maxInst = PLAN_MONTHS[pt] || 1
                        const defaultAmt = pt === 'permuta' ? '' : (PLAN_DEFAULTS[pt] != null ? PLAN_DEFAULTS[pt].toFixed(2) : '')
                        const defaultMethod = pt === 'quarterly' ? 'subscription' : 'pix'
                        setForm(p => ({ ...p, plan_type: pt, installment_count: Math.min(p.installment_count, maxInst), amount: defaultAmt, discount: '0', payment_method: pt === 'permuta' ? p.payment_method : defaultMethod }))
                      }}
                      style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                    >
                      <option value="monthly">Mensal — R$397/mês</option>
                      <option value="quarterly">Trimestral — R$247/mês</option>
                      <option value="permuta">Permuta</option>
                      <option value="legado">Legado</option>
                    </select>
                  </ModalField>
                  <ModalField label="Início">
                    <ModalInput type="date" value={form.plan_start} onChange={v => setForm(p => ({ ...p, plan_start: v }))} />
                  </ModalField>
                </div>
                {form.plan_type === 'permuta' || form.plan_type === 'legado' ? (
                  <div style={{ backgroundColor: 'rgba(100,160,255,0.06)', border: '1px solid rgba(100,160,255,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                      {form.plan_type === 'legado'
                        ? <>Plano <strong style={{ color: '#64A0FF' }}>Legado</strong> — aluno migrado. Sem cobrança automática. Renovação via Eduzz.</>
                        : <>Plano <strong style={{ color: '#64A0FF' }}>Permuta</strong> — sem cobrança. Acesso ativo por 1 ano a partir do início.</>}
                    </p>
                  </div>
                ) : (
                  <>
                    <ModalField label="Forma de pagamento">
                      <select
                        value={form.payment_method}
                        onChange={e => setForm(p => ({ ...p, payment_method: e.target.value, installment_count: 1 }))}
                        style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        {form.plan_type === 'quarterly' ? (
                          <>
                            <option value="subscription">Crédito recorrente</option>
                            <option value="credit">Crédito 3x</option>
                            <option value="pix_auto">PIX automático</option>
                          </>
                        ) : (
                          <>
                            <option value="boleto">Boleto bancário</option>
                            <option value="debit">Cartão de débito</option>
                            <option value="credit">Crédito à vista</option>
                            <option value="pix">PIX</option>
                          </>
                        )}
                      </select>
                    </ModalField>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <ModalField label="Desconto (%)">
                        <ModalInput
                          type="number" placeholder="0" value={form.discount}
                          onChange={v => {
                            const d = Math.max(0, Math.min(100, parseFloat(v) || 0))
                            const base = PLAN_DEFAULTS[form.plan_type]
                            const finalAmt = base != null ? (base * (1 - d / 100)).toFixed(2) : form.amount
                            setForm(p => ({ ...p, discount: v, amount: finalAmt }))
                          }}
                        />
                      </ModalField>
                      <ModalField label="Valor total (R$)">
                        <div style={{ width: '100%', padding: '12px 14px', backgroundColor: 'rgba(232,255,0,0.06)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 10, color: '#E8FF00', fontSize: 15, fontWeight: 800, boxSizing: 'border-box' as const, letterSpacing: 0.3 }}>
                          {parseFloat(form.amount || '0') > 0
                            ? `R$ ${parseFloat(form.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </div>
                      </ModalField>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {form.payment_method === 'credit' && form.plan_type === 'quarterly' && (
                        <ModalField label="Parcelas">
                          <select
                            value={form.installment_count}
                            onChange={e => setForm(p => ({ ...p, installment_count: parseInt(e.target.value) }))}
                            style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          >
                            {Array.from({ length: 3 }, (_, i) => i + 1).map(n => {
                              const amt = parseFloat(form.amount) || 0
                              return (
                                <option key={n} value={n}>
                                  {n === 1 ? 'À vista' : `${n}x${amt > 0 ? ` R$${(amt / n).toFixed(2).replace('.', ',')}` : ''}`}
                                </option>
                              )
                            })}
                          </select>
                        </ModalField>
                      )}
                    </div>
                    {form.amount && parseFloat(form.amount) > 0 && (() => {
                      const totalInst = getInstallmentCount(form.payment_method, form.plan_type, form.installment_count)
                      const amtPerInst = parseFloat(form.amount) / totalInst
                      return (
                        <div style={{ backgroundColor: 'rgba(232,255,0,0.05)', border: '1px solid rgba(232,255,0,0.15)', borderRadius: 10, padding: '10px 12px' }}>
                          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                            Cronograma: <span style={{ color: '#E8FF00', fontWeight: 700 }}>{totalInst}x de R${amtPerInst.toFixed(2).replace('.', ',')}</span>, 1ª parcela em <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(form.plan_start + 'T12:00:00').toLocaleDateString('pt-BR')}</span>.
                          </p>
                        </div>
                      )
                    })()}
                  </>
                )}
                {error && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <ModalBtn onClick={closeModal}>Cancelar</ModalBtn>
                  <ModalBtn primary onClick={handleCreate} disabled={saving} style={{ flex: 2 }}>
                    {saving
                      ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      : 'Criar Aluno'}
                  </ModalBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: migrar treinador */}
      {migrateStudent && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowLeftRight size={16} color="#E8FF00" />
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Migrar Treinador</h2>
              </div>
              <button onClick={() => setMigrateStudent(null)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Aluno */}
              <div style={{ backgroundColor: 'var(--bg)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0A0A0A' }}>{migrateStudent.user.name.charAt(0)}</span>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{migrateStudent.user.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>
                    Treinador atual: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{migrateStudent.coaches?.users?.name ?? '—'}</span>
                  </p>
                </div>
              </div>

              {/* Seletor de novo treinador */}
              <ModalField label="Novo Treinador">
                <select
                  value={selectedCoachId}
                  onChange={e => setSelectedCoachId(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <option value="">Selecione um treinador...</option>
                  {allCoaches.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.id === migrateStudent.coach_id ? ' (atual)' : ''}</option>
                  ))}
                </select>
              </ModalField>

              {migrateError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{migrateError}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <ModalBtn onClick={() => setMigrateStudent(null)}>Cancelar</ModalBtn>
                <ModalBtn
                  primary
                  onClick={handleMigrate}
                  disabled={migrating || !selectedCoachId || selectedCoachId === migrateStudent.coach_id}
                  style={{ flex: 2 }}
                >
                  {migrating
                    ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <><ArrowLeftRight size={15} /> Confirmar Migração</>}
                </ModalBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StudentCard({ student, isSuperAdmin, onClick, onMigrate }: {
  student: StudentRow
  isSuperAdmin: boolean
  onClick: () => void
  onMigrate?: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = STATUS_COLOR[student.payment_status] || '#888'
  const coachName = student.coaches?.users?.name

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center',
        backgroundColor: hovered ? '#161616' : 'var(--surface)',
        borderRadius: 14, border: '1px solid var(--border)',
        padding: 14, cursor: 'pointer', transition: 'background-color 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#0A0A0A' }}>{student.user.name.charAt(0)}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{student.user.name}</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{student.user.email}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{STATUS_LABEL[student.payment_status]}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{PLAN_LABEL[student.plan_type]}</span>
          {isSuperAdmin && coachName && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{coachName}</span>
            </>
          )}
        </div>
      </div>

      {/* Botão migrar (super_admin) */}
      {isSuperAdmin && onMigrate && (
        <button
          onClick={onMigrate}
          title="Migrar treinador"
          style={{
            flexShrink: 0, marginRight: 8,
            width: 34, height: 34, borderRadius: 8,
            backgroundColor: hovered ? 'rgba(232,255,0,0.12)' : 'transparent',
            border: '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(232,255,0,0.2)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(232,255,0,0.3)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = hovered ? 'rgba(232,255,0,0.12)' : 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
        >
          <ArrowLeftRight size={15} color="#E8FF00" />
        </button>
      )}

      <ChevronRight size={16} color="#888" style={{ flexShrink: 0 }} />
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
      {children}
    </div>
  )
}

function ModalInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )
}

function SummaryCard({ icon, value, label, sub, accent, isAlert, isGood }: {
  icon: React.ReactNode; value: number; label: string; sub?: string;
  accent?: string; isAlert?: boolean; isGood?: boolean;
}) {
  const borderColor = isAlert ? 'rgba(255,68,68,0.3)' : isGood ? 'rgba(0,200,83,0.2)' : 'var(--border)'
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: `1px solid ${borderColor}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {icon}
      <p style={{ fontSize: 22, fontWeight: 900, color: accent || 'var(--text)', margin: '4px 0 0', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{sub}</p>}
    </div>
  )
}

function ModalBtn({ children, onClick, primary, disabled, style: extraStyle }: {
  children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; style?: React.CSSProperties
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '13px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1px solid var(--border)',
        backgroundColor: primary ? '#E8FF00' : (hovered ? '#161616' : 'transparent'),
        color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : '#888'),
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  )
}
