import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, MessageCircle, Clock, Edit2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

type Status = 'green' | 'yellow' | 'red'

interface StudentData {
  id: string
  user_id: string
  name: string
  avatar_url: string | null
  lastTrainingAt: string | null
  daysSinceTraining: number
  hasCheckinThisWeek: boolean
  hasCheckinIn2Weeks: boolean
  status: Status
  pendingMessage: { id: string; content: string; scheduled_for: string } | null
}

interface CheckinRow {
  studentId: string
  studentName: string
  avatar_url: string | null
  checkinSentAt: string
  responded: boolean
  responseContent: string | null
  responseAt: string | null
}

interface PendingRow {
  id: string
  student_id: string
  studentName: string
  content: string
  scheduled_for: string
}

const STATUS = {
  green:  { color: '#00C853', label: 'Verde',    bg: 'rgba(0,200,83,0.08)'  },
  yellow: { color: '#FF9800', label: 'Amarelo',  bg: 'rgba(255,152,0,0.08)' },
  red:    { color: '#FF4444', label: 'Vermelho', bg: 'rgba(255,68,68,0.08)' },
}

function getLastMondayISO(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

function daysSince(iso: string | null): number {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Há mais de 30 dias'
  const d = daysSince(iso)
  if (d === 0) return 'Hoje'
  if (d === 1) return 'Ontem'
  if (d < 7)  return `${d} dias atrás`
  return `${Math.floor(d / 7)} sem. atrás`
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Pendente'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function Semaphore() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [tab, setTab] = useState<'semaphore' | 'checkins' | 'pending'>('semaphore')
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<StudentData[]>([])
  const [checkins, setCheckins] = useState<CheckinRow[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    if (!user) return
    setLoading(true)

    const { data: coach } = await supabase
      .from('coaches').select('id').eq('user_id', user.id).single()
    if (!coach) { setLoading(false); return }

    const { data: rawStudents } = await supabase
      .from('students')
      .select('id, user_id, users(name, avatar_url)')
      .eq('coach_id', coach.id)
      .eq('payment_status', 'active')
      .eq('access_blocked', false)

    if (!rawStudents?.length) { setLoading(false); return }

    const studentIds    = rawStudents.map(s => s.id)
    const studentUids   = rawStudents.map(s => s.user_id)
    const lastMonday    = getLastMondayISO()
    const twoWeeksAgo   = new Date(Date.now() - 14 * 86400000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const [sessRes, msgRes, ciRes, pendRes] = await Promise.all([
      // Última sessão de treino (últimos 30 dias)
      supabase
        .from('training_sessions')
        .select('student_id, started_at')
        .in('student_id', studentIds)
        .gte('started_at', thirtyDaysAgo)
        .order('started_at', { ascending: false }),

      // Mensagens dos alunos para o coach nas últimas 2 semanas
      supabase
        .from('messages')
        .select('sender_id, content, created_at')
        .in('sender_id', studentUids)
        .eq('receiver_id', user.id)
        .gte('created_at', twoWeeksAgo)
        .order('created_at', { ascending: false }),

      // Check-ins enviados esta semana
      supabase
        .from('weekly_checkins')
        .select('student_id, sent_at')
        .in('student_id', studentIds)
        .gte('week_start', lastMonday),

      // Mensagens agendadas pendentes
      supabase
        .from('pending_messages')
        .select('id, student_id, content, scheduled_for')
        .eq('coach_id', coach.id)
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true }),
    ])

    // Última sessão por aluno
    const lastTrain = new Map<string, string>()
    for (const s of sessRes.data || []) {
      if (!lastTrain.has(s.student_id)) lastTrain.set(s.student_id, s.started_at)
    }

    // Engajamento por aluno (mensagens → coach)
    const weekStart  = lastMonday + 'T00:00:00Z'
    const thisWeek   = new Set<string>()
    const in2Weeks   = new Set<string>()
    const lastMsg    = new Map<string, { content: string; created_at: string }>()
    for (const m of msgRes.data || []) {
      in2Weeks.add(m.sender_id)
      if (m.created_at >= weekStart) thisWeek.add(m.sender_id)
      if (!lastMsg.has(m.sender_id)) lastMsg.set(m.sender_id, { content: m.content, created_at: m.created_at })
    }

    // Check-ins por aluno
    const ciMap = new Map<string, string>((ciRes.data || []).map(c => [c.student_id, c.sent_at]))

    // Mensagens agendadas por aluno (primeira de cada)
    const pendMap = new Map<string, PendingRow>()
    const pendList: PendingRow[] = []
    for (const pm of pendRes.data || []) {
      const st = rawStudents.find(s => s.id === pm.student_id)
      const row: PendingRow = {
        ...pm,
        studentName: (st as any)?.users?.name ?? 'Aluno',
      }
      pendList.push(row)
      if (!pendMap.has(pm.student_id)) pendMap.set(pm.student_id, row)
    }

    // Montar dados dos alunos
    const data: StudentData[] = rawStudents.map(s => {
      const lastT = lastTrain.get(s.id) || null
      const days  = daysSince(lastT)
      const tw    = thisWeek.has(s.user_id)
      const t2w   = in2Weeks.has(s.user_id)

      let status: Status
      if (days >= 5 || !t2w) status = 'red'
      else if (days <= 2 && tw) status = 'green'
      else status = 'yellow'

      return {
        id: s.id,
        user_id: s.user_id,
        name: (s as any).users?.name ?? '',
        avatar_url: (s as any).users?.avatar_url ?? null,
        lastTrainingAt: lastT,
        daysSinceTraining: days,
        hasCheckinThisWeek: tw,
        hasCheckinIn2Weeks: t2w,
        status,
        pendingMessage: pendMap.get(s.id) ? { id: pendMap.get(s.id)!.id, content: pendMap.get(s.id)!.content, scheduled_for: pendMap.get(s.id)!.scheduled_for } : null,
      }
    })

    data.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.status] - { red: 0, yellow: 1, green: 2 }[b.status]))

    // Check-ins tab: só alunos que receberam check-in esta semana
    const ciRows: CheckinRow[] = rawStudents
      .filter(s => ciMap.has(s.id))
      .map(s => {
        const responded = thisWeek.has(s.user_id)
        const lm = lastMsg.get(s.user_id)
        return {
          studentId: s.id,
          studentName: (s as any).users?.name ?? '',
          avatar_url: (s as any).users?.avatar_url ?? null,
          checkinSentAt: ciMap.get(s.id)!,
          responded,
          responseContent: responded && lm ? lm.content : null,
          responseAt: responded && lm ? lm.created_at : null,
        }
      })
      .sort((a, b) => (a.responded ? 1 : 0) - (b.responded ? 1 : 0))

    setStudents(data)
    setCheckins(ciRows)
    setPending(pendList)
    setLoading(false)
  }

  async function cancelPending(id: string) {
    await supabase
      .from('pending_messages')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
    setPending(p => p.filter(m => m.id !== id))
    setStudents(prev => prev.map(s =>
      s.pendingMessage?.id === id ? { ...s, pendingMessage: null } : s
    ))
  }

  async function savePendingEdit(id: string) {
    setSaving(true)
    await supabase
      .from('pending_messages')
      .update({ content: editContent, updated_at: new Date().toISOString() })
      .eq('id', id)
    setPending(p => p.map(m => m.id === id ? { ...m, content: editContent } : m))
    setStudents(prev => prev.map(s =>
      s.pendingMessage?.id === id ? { ...s, pendingMessage: { ...s.pendingMessage!, content: editContent } } : s
    ))
    setEditingId(null)
    setSaving(false)
  }

  const counts = { red: 0, yellow: 0, green: 0 }
  students.forEach(s => counts[s.status]++)
  const visible = filter === 'all' ? students : students.filter(s => s.status === filter)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%' }} />
    </div>
  )

  const p = isMobile ? 16 : 24

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header + tabs */}
      <div style={{ padding: `${p}px ${p}px 0`, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Activity size={22} color="#E8FF00" />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Semáforo de Alunos</h1>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {([ ['semaphore', 'Semáforo'], ['checkins', `Check-ins (${checkins.length})`], ['pending', `Agendadas (${pending.length})`] ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
                background: tab === id ? 'var(--bg)' : 'transparent',
                color: tab === id ? 'var(--text)' : 'var(--text-2)',
                borderBottom: tab === id ? '2px solid #E8FF00' : '2px solid transparent',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: p }}>

        {/* ── TAB: SEMÁFORO ── */}
        {tab === 'semaphore' && (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {([['all', `Todos ${students.length}`], ['red', `🔴 ${counts.red}`], ['yellow', `🟡 ${counts.yellow}`], ['green', `🟢 ${counts.green}`]] as const).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 14px', fontSize: 13, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                    border: `1.5px solid ${filter === f ? '#E8FF00' : 'var(--border)'}`,
                    background: filter === f ? 'rgba(232,255,0,0.1)' : 'var(--surface)',
                    color: filter === f ? '#E8FF00' : 'var(--text-2)',
                  }}
                >{label}</button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-2)', padding: 48 }}>
                <Activity size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ margin: 0 }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                {visible.map(s => {
                  const st = STATUS[s.status]
                  return (
                    <div key={s.id} style={{ backgroundColor: 'var(--surface)', border: `1.5px solid ${st.color}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
                      {/* Faixa superior colorida */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: st.color }} />

                      {/* Avatar + nome */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: st.color + '28', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: st.color }}>
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : s.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{st.label}</span>
                        </div>
                      </div>

                      {/* Indicadores */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
                          <Activity size={12} />
                          <span>Treino: <strong style={{ color: 'var(--text)' }}>{formatRelative(s.lastTrainingAt)}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
                          <MessageCircle size={12} />
                          <span>Check-in: <strong style={{ color: s.hasCheckinThisWeek ? '#00C853' : s.hasCheckinIn2Weeks ? '#FF9800' : '#FF4444' }}>
                            {s.hasCheckinThisWeek ? '✓ Esta semana' : s.hasCheckinIn2Weeks ? 'Sem resp. semanal' : '2+ sem sem resp.'}
                          </strong></span>
                        </div>
                      </div>

                      {/* Mensagem agendada */}
                      {s.pendingMessage && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 11, color: '#FF9800', fontWeight: 600 }}>
                            ⏱ Msg em {timeUntil(s.pendingMessage.scheduled_for)}
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setEditingId(s.pendingMessage!.id); setEditContent(s.pendingMessage!.content); setTab('pending') }}
                              style={{ flex: 1, padding: '5px 0', fontSize: 11, border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', background: 'none', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Edit2 size={11} /> Editar
                            </button>
                            <button onClick={() => cancelPending(s.pendingMessage!.id)}
                              style={{ flex: 1, padding: '5px 0', fontSize: 11, border: '1px solid #FF444433', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,68,68,0.05)', color: '#FF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <X size={11} /> Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ação */}
                      <button onClick={() => navigate(`/coach/chat/${s.id}`)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6, fontSize: 11, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-2)' }}>
                        <MessageCircle size={11} /> Abrir chat
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── TAB: CHECK-INS ── */}
        {tab === 'checkins' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
              Check-ins enviados desde segunda-feira {getLastMondayISO().split('-').reverse().join('/')}.
            </p>

            {checkins.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-2)', padding: 48 }}>
                <MessageCircle size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ margin: 0 }}>Nenhum check-in enviado esta semana.</p>
                <p style={{ margin: '8px 0 0', fontSize: 12 }}>Os check-ins são disparados automaticamente toda segunda-feira às 8h.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checkins.map(ci => (
                  <div key={ci.studentId} style={{ backgroundColor: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(232,255,0,0.1)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#E8FF00' }}>
                        {ci.avatar_url ? <img src={ci.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ci.studentName.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ci.studentName}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-2)' }}>Enviado {formatRelative(ci.checkinSentAt)}</p>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ci.responded ? 'rgba(0,200,83,0.12)' : 'rgba(255,68,68,0.1)', color: ci.responded ? '#00C853' : '#FF4444', flexShrink: 0 }}>
                        {ci.responded ? '✓ Respondeu' : '✗ Sem resposta'}
                      </span>
                    </div>
                    {ci.responded && ci.responseContent && (
                      <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,200,83,0.05)', borderRadius: 8, borderLeft: '2px solid #00C853' }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>"{ci.responseContent}"</p>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-2)' }}>{fmtDateTime(ci.responseAt!)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── TAB: MENSAGENS AGENDADAS ── */}
        {tab === 'pending' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
              Mensagens criadas automaticamente para alunos em status vermelho. Edite ou cancele antes do envio.
            </p>

            {pending.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-2)', padding: 48 }}>
                <Clock size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ margin: 0 }}>Nenhuma mensagem agendada no momento.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map(pm => (
                  <div key={pm.id} style={{ backgroundColor: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,152,0,0.35)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{pm.studentName}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
                          ⏱ Envio em {timeUntil(pm.scheduled_for)} · {fmtDateTime(pm.scheduled_for)}
                        </p>
                      </div>
                      <button onClick={() => cancelPending(pm.id)}
                        style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #FF444433', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,68,68,0.05)', color: '#FF4444', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <X size={12} /> Cancelar
                      </button>
                    </div>

                    {editingId === pm.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={3}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E8FF00', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => savePendingEdit(pm.id)} disabled={saving}
                            style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer', background: '#E8FF00', color: '#0A0A0A' }}>
                            {saving ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding: '8px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-2)' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <p style={{ flex: 1, margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8 }}>
                          {pm.content}
                        </p>
                        <button onClick={() => { setEditingId(pm.id); setEditContent(pm.content) }}
                          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexShrink: 0 }}>
                          <Edit2 size={12} /> Editar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
