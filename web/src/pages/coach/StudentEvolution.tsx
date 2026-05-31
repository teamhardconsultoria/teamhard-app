import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowLeft, TrendingDown, TrendingUp, Minus, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface AssessmentPoint { date: string; dateLabel: string; weight: number; imc: number; bodyFat?: number }
interface SessionPoint { month: string; count: number }
interface Summary {
  firstWeight: number; lastWeight: number; firstBodyFat?: number; lastBodyFat?: number
  firstImc: number; lastImc: number; totalSessions: number
}

const spin = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function StudentEvolution() {
  const { id: studentId } = useParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [assessments, setAssessments] = useState<AssessmentPoint[]>([])
  const [sessions, setSessions] = useState<SessionPoint[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [studentId])

  const fetchData = async () => {
    const { data: student } = await supabase.from('students').select('user:users(name)').eq('id', studentId).single()
    if (student) setStudentName((student.user as any).name)

    const [assessRes, sessionRes] = await Promise.all([
      supabase.from('assessments').select('weight, height, body_fat_pct, created_at').eq('student_id', studentId).order('created_at', { ascending: true }),
      supabase.from('training_sessions').select('finished_at').eq('student_id', studentId).not('finished_at', 'is', null).order('finished_at', { ascending: true }),
    ])

    const assessPoints: AssessmentPoint[] = (assessRes.data || []).map(a => {
      const h = a.height / 100
      return { date: a.created_at, dateLabel: new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), weight: Number(a.weight), imc: parseFloat((a.weight / (h * h)).toFixed(1)), bodyFat: a.body_fat_pct != null ? Number(a.body_fat_pct) : undefined }
    })
    setAssessments(assessPoints)

    if (assessPoints.length >= 2) {
      const first = assessPoints[0], last = assessPoints[assessPoints.length - 1]
      setSummary({ firstWeight: first.weight, lastWeight: last.weight, firstBodyFat: first.bodyFat, lastBodyFat: last.bodyFat, firstImc: first.imc, lastImc: last.imc, totalSessions: sessionRes.data?.length || 0 })
    }

    const sessionsByMonth: Record<string, number> = {}
    for (const s of sessionRes.data || []) {
      if (!s.finished_at) continue
      const d = new Date(s.finished_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      sessionsByMonth[key] = (sessionsByMonth[key] || 0) + 1
    }
    setSessions(Object.entries(sessionsByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
      const [year, month] = key.split('-')
      return { month: new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), count }
    }))

    setLoading(false)
  }

  const diff = (curr: number, prev: number) => {
    const d = curr - prev
    return { value: d, pct: prev ? ((d / prev) * 100).toFixed(1) : '0' }
  }

  const hasBodyFat = assessments.some(a => a.bodyFat != null)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 760 }}>

        <button onClick={() => navigate(`/coach/students/${studentId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 28, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
          <ArrowLeft size={15} /> Voltar para {studentName || 'Aluno'}
        </button>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Evolução de</p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '4px 0 0 0' }}>{studentName || '...'}</h1>
        </div>

        {assessments.length === 0 && sessions.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Activity size={32} color="#888" style={{ marginBottom: 16 }} />
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhum dado ainda</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '6px 0 0', maxWidth: 320 }}>Os gráficos serão gerados conforme o aluno registrar avaliações e treinos pelo app.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <SummaryCard label="Peso" from={`${summary.firstWeight} kg`} to={`${summary.lastWeight} kg`} diff={diff(summary.lastWeight, summary.firstWeight)} lowerIsBetter />
                {summary.lastBodyFat != null && summary.firstBodyFat != null && (
                  <SummaryCard label="% Gordura" from={`${summary.firstBodyFat}%`} to={`${summary.lastBodyFat}%`} diff={diff(summary.lastBodyFat, summary.firstBodyFat)} lowerIsBetter />
                )}
                <SummaryCard label="IMC" from={String(summary.firstImc)} to={String(summary.lastImc)} diff={diff(summary.lastImc, summary.firstImc)} lowerIsBetter />
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0' }}>Treinos Realizados</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-text)', margin: 0 }}>{summary.totalSessions}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '3px 0 0 0' }}>sessões completas</p>
                </div>
              </div>
            )}

            {assessments.length >= 2 && (
              <ChartCard title="Peso (kg)">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={assessments} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                    <XAxis dataKey="dateLabel" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip unit="kg" />} />
                    <Line type="monotone" dataKey="weight" stroke="#E8FF00" strokeWidth={2.5} dot={{ fill: '#E8FF00', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#E8FF00' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {assessments.length >= 2 && hasBodyFat && (
              <ChartCard title="% de Gordura Corporal">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={assessments.filter(a => a.bodyFat != null)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                    <XAxis dataKey="dateLabel" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip unit="%" />} />
                    <Line type="monotone" dataKey="bodyFat" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#f97316' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {assessments.length >= 2 && (
              <ChartCard title="IMC">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={assessments} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                    <XAxis dataKey="dateLabel" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip unit="" />} />
                    <ReferenceLine y={18.5} stroke="#888" strokeDasharray="4 4" label={{ value: 'Abaixo', fill: '#888', fontSize: 10 }} />
                    <ReferenceLine y={25} stroke="#888" strokeDasharray="4 4" label={{ value: 'Normal', fill: '#888', fontSize: 10 }} />
                    <ReferenceLine y={30} stroke="#888" strokeDasharray="4 4" label={{ value: 'Sobrepeso', fill: '#888', fontSize: 10 }} />
                    <Line type="monotone" dataKey="imc" stroke="#a78bfa" strokeWidth={2.5} dot={{ fill: '#a78bfa', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#a78bfa' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {sessions.length > 0 && (
              <ChartCard title="Treinos por Mês">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sessions} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip unit=" treinos" />} />
                    <Bar dataKey="count" fill="#E8FF00" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {assessments.length === 1 && (
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Apenas 1 avaliação registrada. Os gráficos de evolução aparecem a partir da 2ª avaliação.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
      <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 16px 0' }}>{title}</p>
      {children}
    </div>
  )
}

function SummaryCard({ label, from, to, diff, lowerIsBetter }: { label: string; from: string; to: string; diff: { value: number; pct: string }; lowerIsBetter?: boolean }) {
  const improved = lowerIsBetter ? diff.value < 0 : diff.value > 0
  const neutral = diff.value === 0
  const color = neutral ? 'var(--text-2)' : improved ? '#00C853' : '#FF4444'
  const Icon = neutral ? Minus : improved ? TrendingDown : TrendingUp
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0' }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{to}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <Icon size={12} color={color} />
        <p style={{ fontSize: 11, fontWeight: 600, color, margin: 0 }}>{diff.value > 0 ? '+' : ''}{diff.value.toFixed(1)} ({diff.pct}%)</p>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 0 0' }}>era {from}</p>
    </div>
  )
}

function CustomTooltip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: 'var(--border)', border: '1px solid #3A3A3A', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 3px 0' }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{payload[0].value}{unit}</p>
    </div>
  )
}
