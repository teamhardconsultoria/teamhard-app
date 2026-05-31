import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, TrendingUp, Star, MessageSquare, AlertCircle, ChevronRight, CreditCard, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Stats {
  totalStudents: number
  activeStudents: number
  monthRevenue: number
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
  [dateStr: string]: {
    payment?: boolean
    assessment?: boolean
    workout?: boolean
  }
}

const s = {
  page: { flex: 1, overflowY: 'auto' as const, backgroundColor: 'var(--bg)' },
  content: { padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 720 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  greeting: { fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 },
  date: { fontSize: 12, color: 'var(--text-2)', marginTop: 4, textTransform: 'capitalize' as const },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 },
  card: { backgroundColor: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 4, cursor: 'default' as const, textDecoration: 'none' },
  cardAlert: { border: '1px solid rgba(255,152,0,0.4)' },
  cardValue: { fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0, lineHeight: 1.2 },
  cardLabel: { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: 0 },
  cardSub: { fontSize: 11, color: 'var(--text-2)', margin: 0 },
  sectionLabel: { fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  alertList: { display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 28 },
  alertRow: { display: 'flex', alignItems: 'center', gap: 10, backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '10px 14px', textDecoration: 'none', cursor: 'pointer' as const },
  alertName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 },
  alertReason: { fontSize: 12, margin: 0, marginTop: 1 },
  allGood: { display: 'flex', alignItems: 'center', gap: 8, padding: 14, backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 28 },
  allGoodText: { fontSize: 14, color: '#00C853', fontWeight: 600 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  actionBtn: { backgroundColor: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, textDecoration: 'none', cursor: 'pointer' as const },
  actionLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' },
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvents>({})
  const [coachId, setCoachId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)

    const { data: students } = await supabase
      .from('students')
      .select('id, user_id, payment_status, plan_end, user:users(name)')
      .eq('coach_id', coach.id)

    const list = students || []
    const ids = list.map(s => s.id)
    const userIds = list.map(s => s.user_id)
    const none = ['none']
    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const rangeStart = new Date()
    rangeStart.setMonth(rangeStart.getMonth() - 2)
    rangeStart.setDate(1)
    const rangeEnd = new Date()
    rangeEnd.setMonth(rangeEnd.getMonth() + 4)
    rangeEnd.setDate(0)
    const rStart = rangeStart.toISOString().split('T')[0]
    const rEnd = rangeEnd.toISOString().split('T')[0]

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    const [paymentsRes, feedbacksRes, messagesRes, calPayments, calAssessments, calWorkouts, calDiets, recentAssessments, allWorkouts, allDiets] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'paid')
        .gte('paid_at', startOfMonth.toISOString())
        .in('student_id', ids.length ? ids : none),
      supabase.from('training_feedbacks').select('id', { count: 'exact', head: true })
        .eq('read_by_coach', false).in('student_id', ids.length ? ids : none),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', user!.id)
        .in('sender_id', userIds.length ? userIds : none).is('read_at', null),
      supabase.from('payments').select('due_date')
        .in('student_id', ids.length ? ids : none)
        .gte('due_date', rStart).lte('due_date', rEnd),
      supabase.from('assessments').select('created_at')
        .in('student_id', ids.length ? ids : none)
        .gte('created_at', rStart).lte('created_at', rEnd + 'T23:59:59'),
      supabase.from('workouts').select('valid_from')
        .in('student_id', ids.length ? ids : none)
        .gte('valid_from', rStart).lte('valid_from', rEnd),
      supabase.from('diets').select('valid_from')
        .in('student_id', ids.length ? ids : none)
        .gte('valid_from', rStart).lte('valid_from', rEnd),
      supabase.from('assessments').select('student_id')
        .in('student_id', ids.length ? ids : none)
        .gte('created_at', thirtyDaysAgo + 'T00:00:00'),
      supabase.from('workouts').select('student_id')
        .in('student_id', ids.length ? ids : none),
      supabase.from('diets').select('student_id')
        .in('student_id', ids.length ? ids : none),
    ])

    setStats({
      totalStudents: list.length,
      activeStudents: list.filter(s => s.payment_status === 'active').length,
      monthRevenue: paymentsRes.data?.reduce((acc, p) => acc + (p.amount || 0), 0) || 0,
      unreadFeedbacks: feedbacksRes.count || 0,
      unreadMessages: messagesRes.count || 0,
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

    const events: CalendarEvents = {}
    const add = (dateStr: string, type: keyof CalendarEvents[string]) => {
      if (!events[dateStr]) events[dateStr] = {}
      events[dateStr][type] = true
    }
    calPayments.data?.forEach(p => add(p.due_date, 'payment'))
    calAssessments.data?.forEach(a => add(a.created_at.split('T')[0], 'assessment'))
    calWorkouts.data?.forEach(w => add(w.valid_from, 'workout'))
    calDiets.data?.forEach(d => add(d.valid_from, 'workout'))
    setCalendarEvents(events)

    setLoading(false)
  }

  if (loading) return (
    <div style={s.center}>
      <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const firstName = user?.name?.split(' ')[0] || 'Coach'
  const unreadFeedbacks = stats?.unreadFeedbacks ?? 0
  const unreadMessages = stats?.unreadMessages ?? 0

  return (
    <div style={s.page}>
      <div style={s.content}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <p style={s.greeting}>Olá, {firstName} 👋</p>
            <p style={s.date}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div style={s.grid}>
          <StatCard
            icon={<Users size={18} color="#E8FF00" />}
            value={stats?.totalStudents ?? 0}
            label="Alunos"
            sub={`${stats?.activeStudents ?? 0} ativos`}
          />
          <StatCard
            icon={<TrendingUp size={18} color="#00C853" />}
            value={`R$ ${((stats?.monthRevenue ?? 0) / 1000).toFixed(1)}k`}
            label="Receita/mês"
          />
          <StatCard
            icon={<Star size={18} color={unreadFeedbacks > 0 ? '#FF9800' : '#E8FF00'} />}
            value={unreadFeedbacks}
            label="Feedbacks"
            alert={unreadFeedbacks > 0}
            onClick={() => navigate('/coach/feedbacks')}
          />
          <StatCard
            icon={<MessageSquare size={18} color={unreadMessages > 0 ? '#FF9800' : '#E8FF00'} />}
            value={unreadMessages}
            label="Mensagens"
            alert={unreadMessages > 0}
            onClick={() => navigate('/coach/chat')}
          />
        </div>

        {/* Calendário */}
        <p style={s.sectionLabel}>Calendário</p>
        <Calendar events={calendarEvents} />

        {/* Alertas */}
        <p style={s.sectionLabel}>{alerts.length > 0 ? 'Requer Atenção' : 'Status'}</p>

        {alerts.length === 0 ? (
          <div style={s.allGood}>
            <span style={{ color: '#00C853', fontSize: 16 }}>✓</span>
            <span style={s.allGoodText}>Tudo em ordem!</span>
          </div>
        ) : (
          <div style={s.alertList}>
            {alerts.slice(0, 12).map(a => (
              <div
                key={a.id}
                style={s.alertRow}
                onClick={() => navigate(`/coach/students/${a.id}`)}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161616')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#111')}
              >
                <AlertCircle size={14} color={a.isError ? '#FF4444' : '#FF9800'} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.alertName}>{a.name}</p>
                  <p style={{ ...s.alertReason, color: a.isError ? '#FF4444' : '#FF9800' }}>{a.reason}</p>
                </div>
                <ChevronRight size={14} color="#888" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}

        {/* Ações Rápidas */}
        <p style={s.sectionLabel}>Ações Rápidas</p>
        <div style={s.actions}>
          <ActionBtn icon={<Users size={22} color="#E8FF00" />} label="Ver Alunos" to="/coach/students" navigate={navigate} />
          <ActionBtn icon={<MessageSquare size={22} color="#E8FF00" />} label="Chat" to="/coach/chat" navigate={navigate} />
          <ActionBtn icon={<Star size={22} color="#E8FF00" />} label="Feedbacks" to="/coach/feedbacks" navigate={navigate} />
          <ActionBtn icon={<CreditCard size={22} color="#E8FF00" />} label="Pagamentos" to="/coach/payments" navigate={navigate} />
        </div>


      </div>
    </div>
  )
}

function Calendar({ events }: { events: CalendarEvents }) {
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

  const prev = () => setView(v => {
    const d = new Date(v.year, v.month - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const next = () => setView(v => {
    const d = new Date(v.year, v.month + 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prev} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 6, borderRadius: 8 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{monthLabel}</span>
        <button onClick={next} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 6, borderRadius: 8 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', fontWeight: 700, padding: '4px 0', letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const ev = events[dateStr] || {}
          const isToday = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day
          const hasEvents = ev.payment || ev.assessment || ev.workout

          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 2px 5px',
              borderRadius: 8,
              backgroundColor: isToday ? 'rgba(232,255,0,0.1)' : 'transparent',
              border: isToday ? '1px solid rgba(232,255,0,0.3)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 400, color: isToday ? '#E8FF00' : '#ccc', lineHeight: 1, marginBottom: hasEvents ? 4 : 0 }}>
                {day}
              </span>
              {hasEvents && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {ev.payment && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4444' }} />}
                  {ev.assessment && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />}
                  {ev.workout && <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8FF00' }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', justifyContent: 'center' }}>
        {[
          { color: '#FF4444', label: 'Vencimento' },
          { color: '#3B82F6', label: 'Avaliação' },
          { color: 'var(--accent-text)', label: 'Treino / Dieta' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, value, label, sub, alert, onClick }: {
  icon: React.ReactNode; value: string | number; label: string; sub?: string; alert?: boolean; onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const style = {
    ...s.card,
    ...(alert ? s.cardAlert : {}),
    ...(onClick ? { cursor: 'pointer' as const } : {}),
    ...(hovered && onClick ? { backgroundColor: 'var(--surface-hover)' } : {}),
  }
  return (
    <div style={style} onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {icon}
      <p style={s.cardValue}>{value}</p>
      <p style={s.cardLabel}>{label}</p>
      {sub && <p style={s.cardSub}>{sub}</p>}
    </div>
  )
}

function ActionBtn({ icon, label, to, navigate }: {
  icon: React.ReactNode; label: string; to: string; navigate: (to: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ ...s.actionBtn, ...(hovered ? { backgroundColor: 'var(--surface-hover)', borderColor: 'rgba(232,255,0,0.3)' } : {}) }}
      onClick={() => navigate(to)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon}
      <p style={s.actionLabel}>{label}</p>
    </div>
  )
}

