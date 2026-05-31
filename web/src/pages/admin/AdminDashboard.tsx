import { useEffect, useState } from 'react'
import {
  Users, UserCheck, TrendingUp, DollarSign,
  AlertCircle, Activity, BarChart2,
  PieChart as PieChartIcon,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../lib/supabase'

interface MonthlyRevenue { month: string; value: number }
interface MonthlyNew { month: string; novos: number }
interface StatusSlice { name: string; value: number; color: string }
interface PlanSlice { name: string; value: number }
interface CoachRank { coach_name: string; student_count: number }

const PLAN_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

const PIE_COLORS = ['#E8FF00', '#22c55e', '#3b82f6', '#a855f7']

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
}

const AXIS_TICK = { fill: 'var(--text-2)', fontSize: 11 }
const GRID_STROKE = 'rgba(255,255,255,0.06)'

export default function AdminDashboard() {
  const [totalStudents, setTotalStudents] = useState<number | null>(null)
  const [activeStudents, setActiveStudents] = useState<number | null>(null)
  const [blockedStudents, setBlockedStudents] = useState<number | null>(null)
  const [coaches, setCoaches] = useState<number | null>(null)
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null)
  const [pendingRevenue, setPendingRevenue] = useState<number | null>(null)
  const [overdueRevenue, setOverdueRevenue] = useState<number | null>(null)
  const [revenueByMonth, setRevenueByMonth] = useState<MonthlyRevenue[]>([])
  const [newByMonth, setNewByMonth] = useState<MonthlyNew[]>([])
  const [studentsByStatus, setStudentsByStatus] = useState<StatusSlice[]>([])
  const [studentsByPlan, setStudentsByPlan] = useState<PlanSlice[]>([])
  const [topCoaches, setTopCoaches] = useState<CoachRank[]>([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: allStudents }, { count: coachCount }, { data: paymentsData }] = await Promise.all([
      supabase.from('students').select('payment_status, plan_type, coach_id, created_at, coaches(users(name))'),
      supabase.from('coaches').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('amount, status, paid_at'),
    ])

    setCoaches(coachCount ?? 0)

    if (allStudents) {
      setTotalStudents(allStudents.length)

      const statusMap: Record<string, number> = {}
      const planMap: Record<string, number> = {}
      const coachMap: Record<string, { name: string; count: number }> = {}
      const monthlyNew: Record<string, number> = {}

      allStudents.forEach((s: any) => {
        statusMap[s.payment_status] = (statusMap[s.payment_status] ?? 0) + 1
        const planLabel = PLAN_LABELS[s.plan_type] ?? s.plan_type
        planMap[planLabel] = (planMap[planLabel] ?? 0) + 1

        if (s.coach_id) {
          const name = s.coaches?.users?.name ?? 'Sem nome'
          if (!coachMap[s.coach_id]) coachMap[s.coach_id] = { name, count: 0 }
          coachMap[s.coach_id].count++
        }

        const d = new Date(s.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyNew[key] = (monthlyNew[key] ?? 0) + 1
      })

      setActiveStudents(statusMap['active'] ?? 0)
      setBlockedStudents(statusMap['blocked'] ?? 0)
      setStudentsByStatus(
        [
          { name: 'Ativos', value: statusMap['active'] ?? 0, color: '#E8FF00' },
          { name: 'Pendentes', value: statusMap['pending'] ?? 0, color: '#facc15' },
          { name: 'Atrasados', value: statusMap['overdue'] ?? 0, color: '#f97316' },
          { name: 'Bloqueados', value: statusMap['blocked'] ?? 0, color: '#ef4444' },
        ].filter(s => s.value > 0)
      )
      setStudentsByPlan(Object.entries(planMap).map(([name, value]) => ({ name, value })))
      setTopCoaches(
        Object.values(coachMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(c => ({ coach_name: c.name, student_count: c.count }))
      )

      const newChart: MonthlyNew[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        newChart.push({ month: d.toLocaleDateString('pt-BR', { month: 'short' }), novos: monthlyNew[key] ?? 0 })
      }
      setNewByMonth(newChart)
    }

    if (paymentsData) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const since = new Date(now.getFullYear(), now.getMonth() - 11, 1)

      let thisMonth = 0
      let pending = 0
      let overdue = 0
      const revenueMap: Record<string, number> = {}

      paymentsData.forEach((p: any) => {
        const amount = Number(p.amount)
        if (p.status === 'pending') {
          pending += amount
        } else if (p.status === 'overdue') {
          overdue += amount
        } else if (p.status === 'paid' && p.paid_at) {
          const paidAt = new Date(p.paid_at)
          if (paidAt >= monthStart && paidAt < monthEnd) thisMonth += amount
          if (paidAt >= since) {
            const key = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`
            revenueMap[key] = (revenueMap[key] ?? 0) + amount
          }
        }
      })

      setMonthRevenue(thisMonth)
      setPendingRevenue(pending)
      setOverdueRevenue(overdue)

      const revenueChart: MonthlyRevenue[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        revenueChart.push({ month: d.toLocaleDateString('pt-BR', { month: 'short' }), value: revenueMap[key] ?? 0 })
      }
      setRevenueByMonth(revenueChart)
    }
  }

  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 28px' }}>Dashboard Global</h1>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard icon={<Users size={18} color="#E8FF00" />} label="Total de Alunos" value={totalStudents} />
          <StatCard icon={<UserCheck size={18} color="#22c55e" />} label="Alunos Ativos" value={activeStudents} accent="#22c55e" />
          <StatCard icon={<AlertCircle size={18} color="#ef4444" />} label="Alunos Bloqueados" value={blockedStudents} accent="#ef4444" />
          <StatCard icon={<Activity size={18} color="#E8FF00" />} label="Coaches" value={coaches} />
          <StatCard icon={<TrendingUp size={18} color="#E8FF00" />} label={`Receita — ${monthLabel}`} value={monthRevenue} isCurrency />
          <StatCard icon={<DollarSign size={18} color="#facc15" />} label="A Receber (pendente)" value={pendingRevenue} isCurrency accent="#facc15" />
          <StatCard icon={<DollarSign size={18} color="#f97316" />} label="Em Atraso" value={overdueRevenue} isCurrency accent="#f97316" />
        </div>

        {/* Charts row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18, marginBottom: 18 }}>
          <ChartCard title="Receita Mensal — últimos 12 meses" icon={<BarChart2 size={15} color="#E8FF00" />}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={v => v === 0 ? '0' : `R$${(v / 1000).toFixed(0)}k`}
                  tick={AXIS_TICK} axisLine={false} tickLine={false} width={52}
                />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Receita']}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="value" fill="#E8FF00" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Novos Alunos por Mês — últimos 12 meses" icon={<TrendingUp size={15} color="#E8FF00" />}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={newByMonth} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  formatter={(v: number) => [v, 'Novos alunos']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line
                  type="monotone" dataKey="novos" stroke="#E8FF00" strokeWidth={2.5}
                  dot={{ fill: '#E8FF00', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginBottom: 18 }}>
          <ChartCard title="Alunos por Status" icon={<PieChartIcon size={15} color="#E8FF00" />}>
            <DonutChart data={studentsByStatus} />
          </ChartCard>

          <ChartCard title="Alunos por Plano" icon={<PieChartIcon size={15} color="#E8FF00" />}>
            <DonutChart
              data={studentsByPlan.map((s, i) => ({ ...s, color: PIE_COLORS[i % PIE_COLORS.length] }))}
            />
          </ChartCard>

          {/* Top Coaches */}
          {topCoaches.length > 0 && (
            <ChartCard title="Top Coaches por Alunos" icon={<UserCheck size={15} color="#E8FF00" />}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-2)', fontWeight: 600, paddingBottom: 8, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coach</th>
                    <th style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-2)', fontWeight: 600, paddingBottom: 8, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  {topCoaches.map((c, i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px 0', fontSize: 13, color: 'var(--text)', borderBottom: i < topCoaches.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#E8FF00', flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          {c.coach_name}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: 'var(--text)', borderBottom: i < topCoaches.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        {c.student_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>
          )}
        </div>
      </div>
    </div>
  )
}

function DonutChart({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  if (data.length === 0) {
    return <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: 13 }}>Sem dados</div>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} startAngle={90} endAngle={-270}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [v, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {data.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>{s.name}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, isCurrency = false, accent = '#E8FF00' }: {
  icon: React.ReactNode
  label: string
  value: number | null
  isCurrency?: boolean
  accent?: string
}) {
  const display = value === null
    ? null
    : isCurrency
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : value.toString()

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: `${accent}18`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        {display === null ? (
          <div style={{ width: 70, height: 22, backgroundColor: 'var(--border)', borderRadius: 5, marginBottom: 6, opacity: 0.5 }} />
        ) : (
          <p style={{ fontSize: isCurrency ? 17 : 26, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1 }}>{display}</p>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.3 }}>{label}</p>
      </div>
    </div>
  )
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon}{title}
      </h2>
      {children}
    </div>
  )
}
