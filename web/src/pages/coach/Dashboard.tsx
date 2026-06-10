import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ChevronRight, ChevronLeft, X,
  ClipboardList, Activity, CreditCard,
  UserCheck, Cake, MessageSquare, Star,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Student { id: string; name: string }

interface DashStats {
  assessmentsScheduledToday: Student[]
  updatesToday: number
  updatesTodayStudents: Student[]
  paymentsToday: number
  payments7days: number
  totalStudents: number
  activeStudents: number
  activeStudentsList: Student[]
  blockedStudents: number
  blockedStudentsList: Student[]

  birthdays: Student[]
  unreadFeedbacks: number
  unreadMessages: number
}

interface AlertItem {
  id: string
  name: string
  reason: string
  isError: boolean
}

interface CalendarEvents {
  [dateStr: string]: { payment?: string[]; assessment?: string[]; workout?: string[] }
}

const s = {
  page: { flex: 1, overflowY: 'auto' as const, backgroundColor: 'var(--bg)' },
  content: { padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 720 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  greeting: { fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 },
  date: { fontSize: 12, color: 'var(--text-2)', marginTop: 4, textTransform: 'capitalize' as const },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 },
  card: { backgroundColor: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 4, cursor: 'default' as const },
  cardValue: { fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, lineHeight: 1.2 },
  cardLabel: { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: 0 },
  cardSub: { fontSize: 11, color: 'var(--text-2)', margin: 0, marginTop: 2 },
  sectionLabel: { fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  alertList: { display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 28 },
  alertRow: { display: 'flex', alignItems: 'center', gap: 10, backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '10px 14px', cursor: 'pointer' as const },
  alertName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 },
  alertReason: { fontSize: 12, margin: 0, marginTop: 1 },
  allGood: { display: 'flex', alignItems: 'center', gap: 8, padding: 14, backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 28 },
  allGoodText: { fontSize: 14, color: '#00C853', fontWeight: 600 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  actionBtn: { backgroundColor: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, cursor: 'pointer' as const },
  actionLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' },
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [stats, setStats] = useState<DashStats | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvents>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ label: string; students: Student[] } | null>(null)
  const [calModal, setCalModal] = useState<{ dateStr: string; ev: CalendarEvents[string] } | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    const saved = JSON.parse(localStorage.getItem(`dismissed_alerts_${user?.id}`) || '[]') as string[]
    return new Set(saved)
  })

  const dismissAlert = (a: AlertItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const key = `${a.id}:${a.reason}`
    const storageKey = `dismissed_alerts_${user?.id}`
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
    const updated = [...new Set([...existing, key])]
    localStorage.setItem(storageKey, JSON.stringify(updated))
    setDismissedAlerts(new Set(updated))
  }

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }

    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, payment_status, plan_end, birth_date, assessment_scheduled_date, user:users(name)')
      .eq('coach_id', coach.id)

    const list = students || []
    const ids = list.map(s => s.id)
    const userIds = list.map(s => s.user_id)
    const none = ['none']

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const next7 = new Date(now); next7.setDate(now.getDate() + 7)
    const next7Str = `${next7.getFullYear()}-${pad(next7.getMonth() + 1)}-${pad(next7.getDate())}`
    const ago30 = new Date(now); ago30.setDate(now.getDate() - 30)
    const thirtyDaysAgo = `${ago30.getFullYear()}-${pad(ago30.getMonth() + 1)}-${pad(ago30.getDate())}`

    const rangeStart = new Date(); rangeStart.setMonth(rangeStart.getMonth() - 2); rangeStart.setDate(1)
    const rangeEnd = new Date(); rangeEnd.setMonth(rangeEnd.getMonth() + 4); rangeEnd.setDate(0)
    const rStart = rangeStart.toISOString().split('T')[0]
    const rEnd = rangeEnd.toISOString().split('T')[0]

    const [
      feedbacksRes, messagesRes,
      workoutsTodayRes, dietsTodayRes,
      paymentsTodayRes, payments7daysRes,
      calPayments, calAssessments, calWorkouts, calDiets,
      recentAssessments, allWorkouts, allDiets,
    ] = await Promise.all([
      supabase.from('training_feedbacks').select('id', { count: 'exact', head: true })
        .eq('read_by_coach', false).in('student_id', ids.length ? ids : none),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', user!.id).in('sender_id', userIds.length ? userIds : none).is('read_at', null),

      supabase.from('workouts').select('student_id')
        .in('student_id', ids.length ? ids : none)
        .gte('created_at', todayStr + 'T00:00:00').lte('created_at', todayStr + 'T23:59:59'),
      supabase.from('diets').select('student_id')
        .in('student_id', ids.length ? ids : none)
        .gte('created_at', todayStr + 'T00:00:00').lte('created_at', todayStr + 'T23:59:59'),

      supabase.from('payments').select('id', { count: 'exact', head: true })
        .in('student_id', ids.length ? ids : none)
        .eq('due_date', todayStr).in('status', ['pending', 'overdue']),
      supabase.from('payments').select('id', { count: 'exact', head: true })
        .in('student_id', ids.length ? ids : none)
        .gt('due_date', todayStr).lte('due_date', next7Str).eq('status', 'pending'),

      supabase.from('payments').select('due_date, student_id')
        .in('student_id', ids.length ? ids : none).gte('due_date', rStart).lte('due_date', rEnd),
      supabase.from('assessments').select('created_at, student_id')
        .in('student_id', ids.length ? ids : none).gte('created_at', rStart).lte('created_at', rEnd + 'T23:59:59'),
      supabase.from('workouts').select('valid_from, student_id')
        .in('student_id', ids.length ? ids : none).gte('valid_from', rStart).lte('valid_from', rEnd),
      supabase.from('diets').select('valid_from, student_id')
        .in('student_id', ids.length ? ids : none).gte('valid_from', rStart).lte('valid_from', rEnd),

      supabase.from('assessments').select('student_id')
        .in('student_id', ids.length ? ids : none).gte('created_at', thirtyDaysAgo + 'T00:00:00'),
      supabase.from('workouts').select('student_id').in('student_id', ids.length ? ids : none),
      supabase.from('diets').select('student_id').in('student_id', ids.length ? ids : none),
    ])

    // Aniversariantes de hoje (mês/dia)
    const todayMD = todayStr.slice(5)
    const birthdays: Student[] = list
      .filter((s: any) => s.birth_date && String(s.birth_date).slice(5, 10) === todayMD)
      .map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' }))

    // Avaliações planejadas para hoje
    const assessmentsScheduledToday: Student[] = list
      .filter((s: any) => s.assessment_scheduled_date && String(s.assessment_scheduled_date).slice(0, 10) === todayStr)
      .map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' }))

    // Atualizações realizadas hoje (únicos)
    const updateTodayIds = new Set([
      ...(workoutsTodayRes.data?.map(w => w.student_id) || []),
      ...(dietsTodayRes.data?.map(d => d.student_id) || []),
    ])
    const updatesTodayStudents: Student[] = list
      .filter((s: any) => updateTodayIds.has(s.id))
      .map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' }))

    // Alunos ativos e bloqueados
    const activeStudentsList: Student[] = list
      .filter(s => s.payment_status === 'active')
      .map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' }))

    const blockedStudentsList: Student[] = list
      .filter((s: any) => s.access_blocked)
      .map((s: any) => ({ id: s.id, name: (s.user as any)?.name || '?' }))

    setStats({
      assessmentsScheduledToday,
      updatesToday: (workoutsTodayRes.data?.length ?? 0) + (dietsTodayRes.data?.length ?? 0),
      updatesTodayStudents,
      paymentsToday: paymentsTodayRes.count ?? 0,
      payments7days: payments7daysRes.count ?? 0,
      totalStudents: list.length,
      activeStudents: activeStudentsList.length,
      activeStudentsList,
      blockedStudents: blockedStudentsList.length,
      blockedStudentsList,

      birthdays,
      unreadFeedbacks: feedbacksRes.count ?? 0,
      unreadMessages: messagesRes.count ?? 0,
    })

    const studentsWithRecentAssessment = new Set(recentAssessments.data?.map(a => a.student_id) || [])
    const studentsWithWorkout = new Set(allWorkouts.data?.map(w => w.student_id) || [])
    const studentsWithDiet = new Set(allDiets.data?.map(d => d.student_id) || [])

    const alertList: AlertItem[] = []
    for (const st of list) {
      const planEnd = st.plan_end ? new Date(st.plan_end) : null
      const daysLeft = planEnd ? Math.ceil((planEnd.getTime() - Date.now()) / 86400000) : null
      const name = (st.user as any)?.name || '?'

      if (st.payment_status === 'blocked') alertList.push({ id: st.id, name, reason: 'Acesso bloqueado', isError: true })
      else if (st.payment_status === 'overdue') alertList.push({ id: st.id, name, reason: 'Pagamento vencido', isError: true })
      else if (st.payment_status === 'pending') alertList.push({ id: st.id, name, reason: 'Pagamento pendente', isError: false })
      else if (st.payment_status !== 'active') alertList.push({ id: st.id, name, reason: 'Sem plano ativo', isError: false })
      else if (daysLeft !== null && daysLeft <= 7)
        alertList.push({ id: st.id, name, reason: daysLeft <= 0 ? 'Plano expirado' : `Plano vence em ${daysLeft}d`, isError: daysLeft <= 0 })

      if (st.payment_status === 'active') {
        if (!studentsWithRecentAssessment.has(st.id))
          alertList.push({ id: st.id, name, reason: 'Avaliação há 30+ dias', isError: false })
        if (!studentsWithWorkout.has(st.id))
          alertList.push({ id: st.id, name, reason: 'Sem treino cadastrado', isError: true })
        if (!studentsWithDiet.has(st.id))
          alertList.push({ id: st.id, name, reason: 'Sem dieta cadastrada', isError: true })
      }
    }
    setAlerts(alertList)

    const studentNameById = new Map(list.map((s: any) => [s.id, (s.user as any)?.name as string || '?']))
    const events: CalendarEvents = {}
    const add = (dateStr: string, type: 'payment' | 'assessment' | 'workout', name: string) => {
      if (!events[dateStr]) events[dateStr] = {}
      if (!events[dateStr][type]) events[dateStr][type] = []
      if (!events[dateStr][type]!.includes(name)) events[dateStr][type]!.push(name)
    }
    calPayments.data?.forEach(p => add(p.due_date, 'payment', studentNameById.get(p.student_id) || '?'))
    calAssessments.data?.forEach(a => {
      const d = new Date(a.created_at)
      const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      add(localDate, 'assessment', studentNameById.get(a.student_id) || '?')
    })
    list.forEach((s: any) => { if (s.assessment_scheduled_date) add(String(s.assessment_scheduled_date).slice(0, 10), 'assessment', (s.user as any)?.name || '?') })
    calWorkouts.data?.forEach(w => add(w.valid_from, 'workout', studentNameById.get(w.student_id) || '?'))
    calDiets.data?.forEach(d => add(d.valid_from, 'workout', studentNameById.get(d.student_id) || '?'))
    setCalendarEvents(events)

    setLoading(false)
  }

  if (loading) return (
    <div style={s.center}>
      <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const firstName = user?.name?.split(' ')[0] || 'Coach'
  const st = stats!

  return (
    <div style={s.page}>
      <div style={{ ...s.content, padding: isMobile ? '20px 16px 48px' : '40px 32px 48px' }}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <p style={s.greeting}>Olá, {firstName} 👋</p>
            <p style={s.date}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
        </div>

        {/* Cards */}
        <div style={s.grid}>
          <DashCard
            icon={<ClipboardList size={16} color="#3B82F6" />}
            value={st.assessmentsScheduledToday.length}
            label="Avaliações planejadas para hoje"
            accent={st.assessmentsScheduledToday.length > 0 ? '#3B82F6' : undefined}
            borderAccent="rgba(59,130,246,0.35)"
            onClick={st.assessmentsScheduledToday.length > 0
              ? () => setModal({ label: 'Avaliações planejadas para hoje', students: st.assessmentsScheduledToday })
              : undefined}
          />
          <DashCard
            icon={<Activity size={16} color="#E8FF00" />}
            value={st.updatesToday}
            label="Atualizações realizadas hoje"
            accent={st.updatesToday > 0 ? '#E8FF00' : undefined}
            borderAccent="rgba(232,255,0,0.3)"
            onClick={st.updatesTodayStudents.length > 0
              ? () => setModal({ label: 'Atualizações realizadas hoje', students: st.updatesTodayStudents })
              : undefined}
          />
          <DashCard
            icon={<UserCheck size={16} color="#00C853" />}
            value={st.activeStudents}
            label="Alunos ativos"
            accent="#00C853"
            isGood
            onClick={st.activeStudentsList.length > 0
              ? () => setModal({ label: 'Alunos ativos', students: st.activeStudentsList })
              : undefined}
          />
          <DashCard
            icon={<Cake size={16} color={st.birthdays.length > 0 ? '#FF9800' : 'var(--text-3)'} />}
            value={st.birthdays.length}
            label="Aniversariantes do dia"
            sub={st.birthdays.map(b => b.name.split(' ')[0]).join(', ') || undefined}
            accent={st.birthdays.length > 0 ? '#FF9800' : undefined}
            borderAccent="rgba(255,152,0,0.35)"
            onClick={st.birthdays.length > 0
              ? () => setModal({ label: 'Aniversariantes do dia', students: st.birthdays })
              : undefined}
          />
        </div>

        {/* Calendário */}
        <p style={s.sectionLabel}>Calendário</p>
        <Calendar events={calendarEvents} onDayClick={(dateStr, ev) => setCalModal({ dateStr, ev })} />

        {/* Alertas */}
        {(() => {
          const visible = alerts.filter(a => !dismissedAlerts.has(`${a.id}:${a.reason}`))
          return (
            <>
              <p style={s.sectionLabel}>{visible.length > 0 ? 'Requer Atenção' : 'Status'}</p>
              {visible.length === 0 ? (
                <div style={s.allGood}>
                  <span style={{ color: '#00C853', fontSize: 16 }}>✓</span>
                  <span style={s.allGoodText}>Tudo em ordem!</span>
                </div>
              ) : (
                <div style={s.alertList}>
                  {visible.slice(0, 12).map(a => (
                    <div key={`${a.id}:${a.reason}`} style={s.alertRow}
                      onClick={() => navigate(`/coach/students/${a.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161616')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface)')}>
                      <AlertCircle size={14} color={a.isError ? '#FF4444' : '#FF9800'} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={s.alertName}>{a.name}</p>
                        <p style={{ ...s.alertReason, color: a.isError ? '#FF4444' : '#FF9800' }}>{a.reason}</p>
                      </div>
                      <button onClick={e => dismissAlert(a, e)} title="Dispensar aviso"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        })()}

        {/* Ações Rápidas */}
        <p style={s.sectionLabel}>Ações Rápidas</p>
        <div style={s.actions}>
          <ActionBtn icon={<MessageSquare size={22} color="#E8FF00" />} label="Chat" to="/coach/chat" navigate={navigate} badge={st.unreadMessages} />
          <ActionBtn icon={<Star size={22} color="#E8FF00" />} label="Feedbacks" to="/coach/feedbacks" navigate={navigate} badge={st.unreadFeedbacks} />
          <ActionBtn icon={<CreditCard size={22} color="#E8FF00" />} label="Pagamentos" to="/coach/payments" navigate={navigate} />
          <ActionBtn icon={<ClipboardList size={22} color="#E8FF00" />} label="Alunos" to="/coach/students" navigate={navigate} />
        </div>

      </div>

      {/* Modal calendário */}
      {calModal && (
        <CalendarDayModal
          dateStr={calModal.dateStr}
          ev={calModal.ev}
          onClose={() => setCalModal(null)}
        />
      )}

      {/* Modal lista de alunos */}
      {modal && (
        <StudentListModal
          label={modal.label}
          students={modal.students}
          onClose={() => setModal(null)}
          onNavigate={(id) => { setModal(null); navigate(`/coach/students/${id}`) }}
        />
      )}
    </div>
  )
}

function StudentListModal({ label, students, onClose, onNavigate }: {
  label: string
  students: Student[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{label}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
            <X size={18} />
          </button>
        </div>
        {/* Lista */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {students.map((s, i) => (
            <div
              key={s.id}
              onClick={() => onNavigate(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
                {s.name.charAt(0)}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{s.name}</span>
              <ChevronRight size={15} color="var(--text-3)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DashCard({ icon, value, label, sub, accent, isAlert, isGood, fullWidth, onClick, borderAccent }: {
  icon: React.ReactNode; value: number; label: string; sub?: string;
  accent?: string; isAlert?: boolean; isGood?: boolean; fullWidth?: boolean; onClick?: () => void; borderAccent?: string
}) {
  const [hovered, setHovered] = useState(false)
  const borderColor = isAlert ? 'rgba(255,68,68,0.35)' : isGood ? 'rgba(0,200,83,0.25)' : borderAccent ?? 'var(--border)'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...s.card,
        border: `1px solid ${borderColor}`,
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: hovered && onClick ? 'var(--surface-hover)' : 'var(--surface)',
        transition: 'background-color 0.15s',
        ...(fullWidth ? { gridColumn: '1 / -1' } : {}),
      }}
    >
      {icon}
      <p style={{ ...s.cardValue, color: accent || 'var(--text)' }}>{value}</p>
      <p style={s.cardLabel}>{label}</p>
      {sub && <p style={s.cardSub}>{sub}</p>}
    </div>
  )
}

function Calendar({ events, onDayClick }: { events: CalendarEvents; onDayClick: (dateStr: string, ev: CalendarEvents[string]) => void }) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const firstDay = new Date(view.year, view.month, 1)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const startDow = firstDay.getDay()

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = new Date(view.year, view.month, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const prev = () => setView(v => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  const next = () => setView(v => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prev} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 6, borderRadius: 8 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{monthLabel}</span>
        <button onClick={next} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 6, borderRadius: 8 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', fontWeight: 700, padding: '4px 0', letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const ev = events[dateStr] || {}
          const isToday = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day
          const hasEvents = !!(ev.payment?.length || ev.assessment?.length || ev.workout?.length)
          return (
            <div
              key={i}
              onClick={hasEvents ? () => onDayClick(dateStr, ev) : undefined}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 2px 5px', borderRadius: 8, backgroundColor: isToday ? 'rgba(232,255,0,0.1)' : 'transparent', border: isToday ? '1px solid rgba(232,255,0,0.3)' : '1px solid transparent', cursor: hasEvents ? 'pointer' : 'default', transition: 'background-color 0.12s' }}
              onMouseEnter={e => { if (hasEvents) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = isToday ? 'rgba(232,255,0,0.1)' : 'transparent' }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 400, color: isToday ? '#E8FF00' : '#ccc', lineHeight: 1, marginBottom: hasEvents ? 4 : 0 }}>{day}</span>
              {hasEvents && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {ev.payment?.length && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4444' }} />}
                  {ev.assessment?.length && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />}
                  {ev.workout?.length && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8FF00' }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', justifyContent: 'center' }}>
        {[{ color: '#FF4444', label: 'Vencimento' }, { color: '#3B82F6', label: 'Avaliação' }, { color: 'var(--accent-text)', label: 'Treino / Dieta' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarDayModal({ dateStr, ev, onClose }: {
  dateStr: string
  ev: CalendarEvents[string]
  onClose: () => void
}) {
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const sections = [
    { color: '#3B82F6', title: 'Avaliação',    names: ev.assessment || [] },
    { color: '#FF4444', title: 'Vencimento',   names: ev.payment || [] },
    { color: '#E8FF00', title: 'Treino / Dieta', names: ev.workout || [] },
  ].filter(s => s.names.length > 0)

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}
      onClick={onClose}>
      <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, textTransform: 'capitalize' }}>{label}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sections.map(sec => (
            <div key={sec.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sec.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{sec.title}</span>
              </div>
              {sec.names.map((name, i) => (
                <p key={i} style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 4px 16px' }}>{name}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, to, navigate, badge }: {
  icon: React.ReactNode; label: string; to: string; navigate: (to: string) => void; badge?: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ ...s.actionBtn, position: 'relative', ...(hovered ? { backgroundColor: 'var(--surface-hover)', borderColor: 'rgba(232,255,0,0.3)' } : {}) }}
      onClick={() => navigate(to)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {icon}
      <p style={s.actionLabel}>{label}</p>
      {!!badge && badge > 0 && (
        <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, backgroundColor: '#FF4444', color: '#fff', borderRadius: 10, padding: '1px 5px', fontWeight: 700 }}>{badge}</span>
      )}
    </div>
  )
}
