import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Dumbbell, Salad, ClipboardList, MessageSquare, User, Scale, Activity, List, TrendingUp, History, KeyRound, Copy, Check, CalendarClock, X, ShieldOff, ShieldCheck, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface StudentDetail {
  id: string
  user_id: string
  plan_type: string
  payment_status: string
  plan_end: string
  access_blocked: boolean
  assessment_scheduled_date?: string | null
  user: { name: string; email: string; phone?: string; avatar_url?: string | null }
  anamnese?: {
    goal: string; current_weight: number; height: number
    tmb?: number; get_value?: number; fitness_level?: string; biological_sex: string
  }
  lastSession?: { finished_at: string }
  lastAssessment?: { weight: number; created_at: string }
}

interface EditForm {
  name: string
  phone: string
  plan_type: string
  payment_status: string
  plan_end: string
  // Anamnese
  biological_sex: string
  goal: string
  current_weight: string
  height: string
  desired_weight: string
  goal_months: string
  birth_date: string
  fitness_level: string
  gym_experience: string
  has_disease: boolean
  disease_description: string
  uses_medication: boolean
  medication_description: string
  has_injury: boolean
  injury_description: string
  has_allergy: boolean
  allergy_description: string
  food_restrictions: string
  meals_per_day: string
  water_liters: string
  work_type: string
  sleep_hours: string
}

const PLAN_LABELS: Record<string, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', permuta: 'Permuta',
}
const STATUS_COLORS: Record<string, string> = {
  active: '#00C853', pending: '#FF9800', overdue: '#FF4444', blocked: '#FF4444',
}
const STATUS_LABELS: Record<string, string> = {
  active: 'Em dia', pending: 'Pendente', overdue: 'Vencido', blocked: 'Bloqueado',
}
const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Emagrecimento', muscle_gain: 'Ganho de massa',
  health: 'Saúde', performance: 'Performance', other: 'Outro',
}

const spin = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const isMobile = useIsMobile()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [blocking, setBlocking] = useState(false)

  // Edit modal (super_admin only)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({
    name: '', phone: '', plan_type: '', payment_status: '', plan_end: '',
    biological_sex: '', goal: '', current_weight: '', height: '', desired_weight: '', goal_months: '',
    birth_date: '', fitness_level: 'beginner', gym_experience: 'never',
    has_disease: false, disease_description: '', uses_medication: false, medication_description: '',
    has_injury: false, injury_description: '', has_allergy: false, allergy_description: '',
    food_restrictions: '', meals_per_day: '3', water_liters: '2', work_type: 'sedentary', sleep_hours: '7',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => { fetchStudent() }, [id])

  const handleResetPassword = async () => {
    if (!confirm(`Gerar nova senha temporária para ${student?.user.name}?`)) return
    setResetting(true)
    const { data } = await supabase.functions.invoke('reset-student-password', { body: { student_id: id } })
    setResetting(false)
    if (data?.error) { alert(`Erro: ${data.error}`); return }
    setNewPassword(data.temp_password)
    supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      .then(({ data: coach }) => {
        if (coach) supabase.from('activity_logs').insert({ coach_id: coach.id, action_type: 'reset_password', target_student_id: id, details: { student_name: student?.user.name } })
      })
  }

  const handleSaveSchedule = async () => {
    if (!scheduleDate) return
    setSavingSchedule(true)
    await supabase.from('students').update({ assessment_scheduled_date: scheduleDate }).eq('id', id)
    setSavingSchedule(false)
    setStudent(prev => prev ? { ...prev, assessment_scheduled_date: scheduleDate } : prev)
  }

  const handleClearSchedule = async () => {
    setSavingSchedule(true)
    await supabase.from('students').update({ assessment_scheduled_date: null }).eq('id', id)
    setSavingSchedule(false)
    setScheduleDate('')
    setStudent(prev => prev ? { ...prev, assessment_scheduled_date: null } : prev)
  }

  const copyPassword = () => {
    if (!newPassword) return
    navigator.clipboard.writeText(newPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleBlock = async () => {
    if (!student) return
    const newBlocked = !student.access_blocked
    const action = newBlocked ? 'bloquear' : 'reativar'
    if (!confirm(`${newBlocked ? 'Bloquear' : 'Reativar'} acesso de ${student.user.name}?`)) return
    setBlocking(true)
    await supabase.from('students').update({ access_blocked: newBlocked }).eq('id', id)
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (coach) await supabase.from('activity_logs').insert({ coach_id: coach.id, action_type: action === 'bloquear' ? 'blocked_student' : 'unblocked_student', target_student_id: id, details: { student_name: student.user.name } })
    setStudent(prev => prev ? { ...prev, access_blocked: newBlocked } : prev)
    setBlocking(false)
  }

  const openEdit = () => {
    if (!student) return
    const a = student.anamnese as any
    setEditForm({
      name: student.user.name,
      phone: student.user.phone ?? '',
      plan_type: student.plan_type,
      payment_status: student.payment_status,
      plan_end: student.plan_end,
      biological_sex: a?.biological_sex ?? '',
      goal: a?.goal ?? '',
      current_weight: a?.current_weight?.toString() ?? '',
      height: a?.height?.toString() ?? '',
      desired_weight: a?.desired_weight?.toString() ?? '',
      goal_months: a?.goal_months?.toString() ?? '',
      birth_date: a?.birth_date ?? '',
      fitness_level: a?.fitness_level ?? 'beginner',
      gym_experience: a?.gym_experience ?? 'never',
      has_disease: a?.has_disease ?? false,
      disease_description: a?.disease_description ?? '',
      uses_medication: a?.uses_medication ?? false,
      medication_description: a?.medication_description ?? '',
      has_injury: a?.has_injury ?? false,
      injury_description: a?.injury_description ?? '',
      has_allergy: a?.has_allergy ?? false,
      allergy_description: a?.allergy_description ?? '',
      food_restrictions: a?.food_restrictions ?? '',
      meals_per_day: a?.meals_per_day?.toString() ?? '3',
      water_liters: a?.water_liters?.toString() ?? '2',
      work_type: a?.work_type ?? 'sedentary',
      sleep_hours: a?.sleep_hours?.toString() ?? '7',
    })
    setEditError('')
    setShowEdit(true)
  }

  const handleSaveEdit = async () => {
    if (!student || !editForm.name.trim()) { setEditError('O nome não pode estar vazio.'); return }
    setEditSaving(true)
    setEditError('')

    const { error: userErr } = await supabase.from('users').update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
    }).eq('id', student.user_id)
    if (userErr) { setEditError(userErr.message); setEditSaving(false); return }

    const { error: studentErr } = await supabase.from('students').update({
      plan_type: editForm.plan_type,
      payment_status: editForm.payment_status,
      plan_end: editForm.plan_end,
    }).eq('id', student.id)
    if (studentErr) { setEditError(studentErr.message); setEditSaving(false); return }

    const anamnesePayload: Record<string, any> = {
      student_id: student.id,
      full_name: editForm.name.trim(),
      birth_date: editForm.birth_date || null,
      biological_sex: editForm.biological_sex || null,
      goal: editForm.goal || null,
      current_weight: editForm.current_weight ? parseFloat(editForm.current_weight) : null,
      height: editForm.height ? parseFloat(editForm.height) : null,
      desired_weight: editForm.desired_weight ? parseFloat(editForm.desired_weight) : null,
      goal_months: editForm.goal_months ? parseInt(editForm.goal_months) : null,
      fitness_level: editForm.fitness_level || null,
      gym_experience: editForm.gym_experience || null,
      has_disease: editForm.has_disease,
      disease_description: editForm.has_disease ? editForm.disease_description : null,
      uses_medication: editForm.uses_medication,
      medication_description: editForm.uses_medication ? editForm.medication_description : null,
      has_injury: editForm.has_injury,
      injury_description: editForm.has_injury ? editForm.injury_description : null,
      has_allergy: editForm.has_allergy,
      allergy_description: editForm.has_allergy ? editForm.allergy_description : null,
      food_restrictions: editForm.food_restrictions || null,
      meals_per_day: editForm.meals_per_day ? parseInt(editForm.meals_per_day) : null,
      water_liters: editForm.water_liters ? parseFloat(editForm.water_liters) : null,
      work_type: editForm.work_type || null,
      sleep_hours: editForm.sleep_hours ? parseFloat(editForm.sleep_hours) : null,
    }
    const { error: anamneseErr } = await supabase.from('anamnese').upsert(anamnesePayload, { onConflict: 'student_id' })
    if (anamneseErr) { setEditError(anamneseErr.message); setEditSaving(false); return }

    setEditSaving(false)
    setShowEdit(false)
    fetchStudent()
  }

  const fetchStudent = async () => {
    const { data } = await supabase.from('students').select(`
      id, user_id, plan_type, payment_status, plan_end, access_blocked, assessment_scheduled_date,
      user:users(name, email, phone, avatar_url)
    `).eq('id', id).single()

    if (data) {
      const [sessionRes, assessRes, anamneseRes] = await Promise.all([
        supabase.from('training_sessions').select('finished_at').eq('student_id', id).order('finished_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('assessments').select('weight, created_at').eq('student_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('anamnese').select('*').eq('student_id', id).maybeSingle(),
      ])
      setStudent({
        ...data,
        access_blocked: (data as any).access_blocked ?? false,
        user: data.user as any,
        anamnese: anamneseRes.data || undefined,
        lastSession: sessionRes.data || undefined,
        lastAssessment: assessRes.data || undefined,
      })
      setScheduleDate(data.assessment_scheduled_date || '')
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  if (!student) return (
    <div style={{ flex: 1, backgroundColor: 'var(--bg)', padding: 32, color: 'var(--text-2)', fontSize: 14 }}>
      Aluno não encontrado.
    </div>
  )

  const statusColor = STATUS_COLORS[student.payment_status] || '#888'
  const weight = student.lastAssessment?.weight || student.anamnese?.current_weight

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: isMobile ? '16px 16px 48px' : '40px 32px 48px', maxWidth: 720 }}>

        {/* Voltar */}
        <button onClick={() => navigate('/coach/students')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 28, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ArrowLeft size={15} /> Voltar para Alunos
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8FF00', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 26, fontWeight: 900, color: '#0A0A0A' }}>
            {student.user.avatar_url
              ? <img src={student.user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : student.user.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{student.user.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0 0' }}>{student.user.email}</p>
            {student.user.phone && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0 0' }}>{student.user.phone}</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: statusColor, margin: 0 }}>{STATUS_LABELS[student.payment_status]}</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0 0' }}>{PLAN_LABELS[student.plan_type] || student.plan_type}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0 0' }}>Vence {new Date(student.plan_end).toLocaleDateString('pt-BR')}</p>
            </div>
            <button onClick={openEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: 'rgba(232,255,0,0.1)', border: '1px solid rgba(232,255,0,0.25)', borderRadius: 8, color: '#E8FF00', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(232,255,0,0.1)')}>
              <Pencil size={13} /> Editar perfil
            </button>
          </div>
        </div>

        {/* Stats da anamnese */}
        {student.anamnese && (
          <>
            <p style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Dados do Aluno</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
              {weight && <MiniStat icon={<Scale size={14} color="#E8FF00" />} label="Peso" value={`${weight} kg`} />}
              <MiniStat icon={<User size={14} color="#E8FF00" />} label="Objetivo" value={GOAL_LABELS[student.anamnese.goal] || student.anamnese.goal} />
              {student.anamnese.tmb && <MiniStat icon={<Activity size={14} color="#E8FF00" />} label="TMB" value={`${Math.round(student.anamnese.tmb)} kcal`} />}
              {student.anamnese.get_value && <MiniStat icon={<Activity size={14} color="#E8FF00" />} label="GET" value={`${Math.round(student.anamnese.get_value)} kcal`} />}
            </div>
          </>
        )}

        {/* Último treino */}
        {student.lastSession?.finished_at && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>Último Treino</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {new Date(student.lastSession.finished_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
        )}

        {/* Ações */}
        <p style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Ações</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <ActionCard icon={<List size={20} color="#E8FF00" />} title="Ver Treinos" description="Histórico e treinos ativos" to={`/coach/students/${id}/workouts`} navigate={navigate} />
          <ActionCard icon={<Dumbbell size={20} color="#E8FF00" />} title="Novo Treino" description="Monte divisões de treino" to={`/coach/students/${id}/workout/new`} navigate={navigate} />
          <ActionCard icon={<List size={20} color="#E8FF00" />} title="Ver Dietas" description="Dietas ativas e histórico" to={`/coach/students/${id}/diets`} navigate={navigate} />
          <ActionCard icon={<Salad size={20} color="#E8FF00" />} title="Nova Dieta" description="Monte refeições com macros" to={`/coach/students/${id}/diet/new`} navigate={navigate} />
          <ActionCard icon={<MessageSquare size={20} color="#E8FF00" />} title="Chat" description="Enviar mensagem ao aluno" to={`/coach/chat/${id}`} navigate={navigate} />
          <ActionCard icon={<TrendingUp size={20} color="#E8FF00" />} title="Evolução" description="Gráficos de peso e frequência" to={`/coach/students/${id}/evolution`} navigate={navigate} />
          <ActionCard icon={<History size={20} color="#E8FF00" />} title="Histórico de Treinos" description="Sessões com cargas e reps" to={`/coach/students/${id}/sessions`} navigate={navigate} />
          <ActionCard icon={<ClipboardList size={20} color="#E8FF00" />} title="Avaliações" description="Fotos e histórico de medidas" to="/coach/assessments" navigate={navigate} />
        </div>

        {/* Agendar avaliação */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalendarClock size={16} color="#E8FF00" />
            <p style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Agendar Avaliação</p>
          </div>
          {student.assessment_scheduled_date ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>
                  Agendada para <strong>{new Date(student.assessment_scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0 0' }}>O aluno poderá enviar fotos apenas nesta data.</p>
              </div>
              <button onClick={handleClearSchedule} disabled={savingSchedule}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF4444'; (e.currentTarget as HTMLElement).style.color = '#FF4444' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}>
                <X size={13} /> Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                style={{ flex: 1, padding: '8px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              <button onClick={handleSaveSchedule} disabled={!scheduleDate || savingSchedule}
                style={{ padding: '8px 16px', backgroundColor: scheduleDate ? '#E8FF00' : 'var(--border)', color: scheduleDate ? '#0A0A0A' : 'var(--text-2)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: scheduleDate ? 'pointer' : 'not-allowed' }}>
                {savingSchedule ? 'Salvando…' : 'Agendar'}
              </button>
            </div>
          )}
        </div>

        {/* Reset de senha + Bloqueio */}
        <div style={{ backgroundColor: 'var(--surface)', border: `1px solid ${student.access_blocked ? 'rgba(255,68,68,0.4)' : 'var(--border)'}`, borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 16px 0' }}>Acesso</p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>Gerar nova senha temporária para o aluno</p>
            <ResetBtn onClick={handleResetPassword} disabled={resetting}>
              <KeyRound size={14} /> {resetting ? 'Gerando…' : 'Resetar senha'}
            </ResetBtn>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div>
              <p style={{ fontSize: 14, color: student.access_blocked ? '#FF4444' : 'var(--text)', margin: 0, fontWeight: student.access_blocked ? 700 : 400 }}>
                {student.access_blocked ? 'Acesso bloqueado' : 'Bloquear acesso do aluno'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>
                {student.access_blocked ? 'O aluno não consegue entrar no app.' : 'Impede o aluno de acessar o app.'}
              </p>
            </div>
            <BlockBtn onClick={handleToggleBlock} disabled={blocking} blocked={student.access_blocked}>
              {student.access_blocked
                ? <><ShieldCheck size={14} /> {blocking ? 'Reativando…' : 'Reativar acesso'}</>
                : <><ShieldOff size={14} /> {blocking ? 'Bloqueando…' : 'Bloquear acesso'}</>
              }
            </BlockBtn>
          </div>

          {newPassword && (
            <div style={{ marginTop: 16, padding: 14, backgroundColor: 'var(--bg)', border: '1px solid rgba(232,255,0,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 4px 0' }}>Nova senha temporária — envie ao aluno:</p>
                <p style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 900, color: 'var(--accent-text)', letterSpacing: 4, margin: 0 }}>{newPassword}</p>
              </div>
              <button onClick={copyPassword}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#00C853' : '#888', flexShrink: 0, padding: 4 }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal: editar perfil (super_admin) */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pencil size={15} color="#E8FF00" />
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Editar Perfil</h2>
              </div>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Dados pessoais */}
              <EditSection label="Dados Pessoais">
                <EditField label="Nome completo">
                  <EditInput value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} placeholder="Nome do aluno" />
                </EditField>
                <EditField label="WhatsApp">
                  <EditInput type="tel" value={editForm.phone} onChange={v => setEditForm(p => ({ ...p, phone: v }))} placeholder="+55 11 99999-9999" />
                </EditField>
              </EditSection>

              {/* Plano */}
              <EditSection label="Plano">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <EditField label="Tipo de plano">
                    <select value={editForm.plan_type} onChange={e => setEditForm(p => ({ ...p, plan_type: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                      <option value="monthly">Mensal — R$397/mês</option>
                      <option value="quarterly">Trimestral — R$247/mês</option>
                      <option value="permuta">Permuta</option>
                      <option value="semiannual">Semestral (legado)</option>
                      <option value="annual">Anual (legado)</option>
                    </select>
                  </EditField>
                  <EditField label="Status de pagamento">
                    <select value={editForm.payment_status} onChange={e => setEditForm(p => ({ ...p, payment_status: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                      <option value="active">Ativo</option>
                      <option value="pending">Pendente</option>
                      <option value="overdue">Em atraso</option>
                      <option value="blocked">Bloqueado</option>
                    </select>
                  </EditField>
                </div>
                <EditField label="Data de vencimento">
                  <EditInput type="date" value={editForm.plan_end} onChange={v => setEditForm(p => ({ ...p, plan_end: v }))} />
                </EditField>
              </EditSection>

              {/* Anamnese */}
              <EditSection label="Dados Físicos e Objetivo">
                <EditField label="Data de nascimento">
                  <EditInput type="date" value={editForm.birth_date} onChange={v => setEditForm(p => ({ ...p, birth_date: v }))} />
                </EditField>
                <EditField label="Sexo biológico">
                  <select value={editForm.biological_sex} onChange={e => setEditForm(p => ({ ...p, biological_sex: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                    <option value="">Selecionar…</option>
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </EditField>
                <EditField label="Objetivo">
                  <select value={editForm.goal} onChange={e => setEditForm(p => ({ ...p, goal: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                    <option value="">Selecionar…</option>
                    <option value="weight_loss">Emagrecimento</option>
                    <option value="muscle_gain">Ganho de massa</option>
                    <option value="health">Saúde</option>
                    <option value="performance">Performance</option>
                    <option value="other">Outro</option>
                  </select>
                </EditField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <EditField label="Peso atual (kg)">
                    <EditInput type="number" value={editForm.current_weight} onChange={v => setEditForm(p => ({ ...p, current_weight: v }))} placeholder="Ex: 70.5" step="0.1" min="30" max="250" />
                  </EditField>
                  <EditField label="Peso desejado (kg)">
                    <EditInput type="number" value={editForm.desired_weight} onChange={v => setEditForm(p => ({ ...p, desired_weight: v }))} placeholder="Ex: 65.0" step="0.1" min="30" max="250" />
                  </EditField>
                  <EditField label="Altura (cm)">
                    <EditInput type="number" value={editForm.height} onChange={v => setEditForm(p => ({ ...p, height: v }))} placeholder="Ex: 175" step="1" min="100" max="250" />
                  </EditField>
                  <EditField label="Prazo do objetivo (meses)">
                    <EditInput type="number" value={editForm.goal_months} onChange={v => setEditForm(p => ({ ...p, goal_months: v }))} placeholder="Ex: 6" step="1" min="1" max="60" />
                  </EditField>
                </div>
              </EditSection>

              <EditSection label="Experiência e Rotina">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <EditField label="Nível de condicionamento">
                    <select value={editForm.fitness_level} onChange={e => setEditForm(p => ({ ...p, fitness_level: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                      <option value="beginner">Iniciante</option>
                      <option value="intermediate">Intermediário</option>
                      <option value="advanced">Avançado</option>
                    </select>
                  </EditField>
                  <EditField label="Experiência na musculação">
                    <select value={editForm.gym_experience} onChange={e => setEditForm(p => ({ ...p, gym_experience: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                      <option value="never">Nunca treinei</option>
                      <option value="less_1y">Menos de 1 ano</option>
                      <option value="1_3y">1 a 3 anos</option>
                      <option value="more_3y">Mais de 3 anos</option>
                    </select>
                  </EditField>
                  <EditField label="Tipo de trabalho">
                    <select value={editForm.work_type} onChange={e => setEditForm(p => ({ ...p, work_type: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                      <option value="sedentary">Sedentário</option>
                      <option value="light">Leve (em pé ou caminhando)</option>
                      <option value="moderate">Moderado</option>
                      <option value="heavy">Pesado (trabalho físico)</option>
                    </select>
                  </EditField>
                  <EditField label="Horas de sono/noite">
                    <EditInput type="number" value={editForm.sleep_hours} onChange={v => setEditForm(p => ({ ...p, sleep_hours: v }))} placeholder="Ex: 7" step="0.5" min="3" max="12" />
                  </EditField>
                </div>
              </EditSection>

              <EditSection label="Saúde">
                <CheckRow label="Possui alguma doença ou condição médica?" checked={editForm.has_disease} onChange={v => setEditForm(p => ({ ...p, has_disease: v }))} />
                {editForm.has_disease && (
                  <EditField label="Descreva">
                    <EditInput value={editForm.disease_description} onChange={v => setEditForm(p => ({ ...p, disease_description: v }))} placeholder="Ex: Diabetes tipo 2, hipertensão…" />
                  </EditField>
                )}
                <CheckRow label="Faz uso de medicamentos?" checked={editForm.uses_medication} onChange={v => setEditForm(p => ({ ...p, uses_medication: v }))} />
                {editForm.uses_medication && (
                  <EditField label="Quais medicamentos?">
                    <EditInput value={editForm.medication_description} onChange={v => setEditForm(p => ({ ...p, medication_description: v }))} placeholder="Ex: Metformina 500mg…" />
                  </EditField>
                )}
                <CheckRow label="Possui lesão ou limitação física?" checked={editForm.has_injury} onChange={v => setEditForm(p => ({ ...p, has_injury: v }))} />
                {editForm.has_injury && (
                  <EditField label="Descreva a lesão">
                    <EditInput value={editForm.injury_description} onChange={v => setEditForm(p => ({ ...p, injury_description: v }))} placeholder="Ex: Hérnia de disco L4-L5…" />
                  </EditField>
                )}
              </EditSection>

              <EditSection label="Alimentação">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <EditField label="Refeições por dia">
                    <EditInput type="number" value={editForm.meals_per_day} onChange={v => setEditForm(p => ({ ...p, meals_per_day: v }))} placeholder="Ex: 4" step="1" min="1" max="10" />
                  </EditField>
                  <EditField label="Água (litros/dia)">
                    <EditInput type="number" value={editForm.water_liters} onChange={v => setEditForm(p => ({ ...p, water_liters: v }))} placeholder="Ex: 2" step="0.5" min="0.5" max="10" />
                  </EditField>
                </div>
                <CheckRow label="Possui alergia alimentar?" checked={editForm.has_allergy} onChange={v => setEditForm(p => ({ ...p, has_allergy: v }))} />
                {editForm.has_allergy && (
                  <EditField label="Quais alergias?">
                    <EditInput value={editForm.allergy_description} onChange={v => setEditForm(p => ({ ...p, allergy_description: v }))} placeholder="Ex: Lactose, glúten…" />
                  </EditField>
                )}
                <EditField label="Restrições alimentares">
                  <EditInput value={editForm.food_restrictions} onChange={v => setEditForm(p => ({ ...p, food_restrictions: v }))} placeholder="Ex: Vegetariano, sem glúten…" />
                </EditField>
              </EditSection>

              {editError && (
                <p style={{ color: '#FF4444', fontSize: 13, margin: 0, padding: '8px 12px', backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(255,68,68,0.2)' }}>
                  {editError}
                </p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowEdit(false)}
                  style={{ flex: 1, padding: '11px 16px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  style={{ flex: 2, padding: '11px 16px', backgroundColor: editSaving ? 'var(--border)' : '#E8FF00', color: editSaving ? 'var(--text-2)' : '#0A0A0A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                  {editSaving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function EditSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px 0' }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, backgroundColor: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: '#E8FF00', cursor: 'pointer' }} />
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{label}</span>
    </label>
  )
}

function EditInput({ value, onChange, type = 'text', placeholder, step, min, max }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; step?: string; min?: string; max?: string }) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} step={step} min={min} max={max}
      style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <p style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{label}</p>
      </div>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{value}</p>
    </div>
  )
}

function ActionCard({ icon, title, description, to, navigate }: { icon: React.ReactNode; title: string; description: string; to: string; navigate: (to: string) => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onClick={() => navigate(to)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ backgroundColor: hovered ? '#161616' : 'var(--surface)', border: `1px solid ${hovered ? 'rgba(232,255,0,0.3)' : '#1E1E1E'}`, borderRadius: 14, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: hovered ? 'rgba(232,255,0,0.2)' : 'rgba(232,255,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background-color 0.15s' }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{description}</p>
      </div>
    </div>
  )
}

function ResetBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', backgroundColor: hovered && !disabled ? '#2a2a2a' : '#1E1E1E', color: 'var(--text)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0, transition: 'background-color 0.15s' }}>
      {children}
    </button>
  )
}

function BlockBtn({ children, onClick, disabled, blocked }: { children: React.ReactNode; onClick: () => void; disabled: boolean; blocked: boolean }) {
  const [hovered, setHovered] = useState(false)
  const bgIdle = blocked ? 'rgba(0,200,83,0.1)' : 'rgba(255,68,68,0.1)'
  const bgHover = blocked ? 'rgba(0,200,83,0.2)' : 'rgba(255,68,68,0.2)'
  const border = blocked ? 'rgba(0,200,83,0.4)' : 'rgba(255,68,68,0.4)'
  const color = blocked ? '#00C853' : '#FF4444'
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', backgroundColor: hovered && !disabled ? bgHover : bgIdle, color, border: `1px solid ${border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0, transition: 'background-color 0.15s' }}>
      {children}
    </button>
  )
}
