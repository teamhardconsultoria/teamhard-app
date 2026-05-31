import { useEffect, useState } from 'react'
import { Search, Activity, Dumbbell, Utensils, ClipboardList, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface LogEntry {
  id: string
  action_type: string
  details: Record<string, any>
  created_at: string
  coach: { id: string; user: { name: string } }
  student: { id: string; user: { name: string } } | null
}

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  created_workout: { label: 'Criou treino',    color: '#4FC3F7', icon: <Dumbbell size={14} /> },
  updated_workout: { label: 'Editou treino',   color: '#81D4FA', icon: <Dumbbell size={14} /> },
  created_diet:    { label: 'Criou dieta',     color: '#A5D6A7', icon: <Utensils  size={14} /> },
  updated_diet:    { label: 'Editou dieta',    color: '#C8E6C9', icon: <Utensils  size={14} /> },
  created_student: { label: 'Cadastrou aluno', color: '#CE93D8', icon: <ClipboardList size={14} /> },
  reset_password:  { label: 'Redefiniu senha', color: '#FFCC80', icon: <Activity  size={14} /> },
}

const ALL_TYPES = Object.keys(ACTION_META)

const spin: React.CSSProperties = {
  width: 32, height: 32, border: '2px solid #E8FF00',
  borderTopColor: 'transparent', borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityLogs() {
  const [logs, setLogs]           = useState<LogEntry[]>([])
  const [filtered, setFiltered]   = useState<LogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [coachFilter, setCoachFilter] = useState<string>('all')
  const [coaches, setCoaches]     = useState<{ id: string; name: string }[]>([])

  useEffect(() => { fetchLogs() }, [])

  useEffect(() => {
    let result = logs
    if (typeFilter !== 'all') result = result.filter(l => l.action_type === typeFilter)
    if (coachFilter !== 'all') result = result.filter(l => l.coach.id === coachFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.coach.user.name.toLowerCase().includes(q) ||
        (l.student?.user.name.toLowerCase().includes(q)) ||
        (ACTION_META[l.action_type]?.label.toLowerCase().includes(q)) ||
        JSON.stringify(l.details).toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [logs, search, typeFilter, coachFilter])

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select(`
        id, action_type, details, created_at,
        coach:coaches!inner(id, user:users!inner(name)),
        student:students(id, user:users!inner(name))
      `)
      .order('created_at', { ascending: false })
      .limit(500)

    const entries = (data || []) as unknown as LogEntry[]
    setLogs(entries)
    setFiltered(entries)

    const seen = new Set<string>()
    const coachList: { id: string; name: string }[] = []
    entries.forEach(e => {
      if (!seen.has(e.coach.id)) {
        seen.add(e.coach.id)
        coachList.push({ id: e.coach.id, name: e.coach.user.name })
      }
    })
    setCoaches(coachList.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
    color: 'var(--text)', fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Log de Atividades</h1>
            {!loading && (
              <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '2px 8px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{filtered.length} registros</span>
              </div>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Busca */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} color="#888" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Buscar por coach, aluno ou ação..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 36, width: '100%', boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Filtro tipo */}
          <div style={{ position: 'relative' }}>
            <Filter size={14} color="#888" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select
              value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30, appearance: 'none', cursor: 'pointer', minWidth: 160 }}
            >
              <option value="all">Todos os tipos</option>
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{ACTION_META[t]?.label || t}</option>
              ))}
            </select>
          </div>

          {/* Filtro coach */}
          {coaches.length > 1 && (
            <select
              value={coachFilter} onChange={e => setCoachFilter(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', minWidth: 160 }}
            >
              <option value="all">Todos os coaches</option>
              {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={spin} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid var(--border)' }}>
              <Activity size={24} color="var(--text-2)" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>
              {search || typeFilter !== 'all' || coachFilter !== 'all' ? 'Nenhum resultado encontrado.' : 'Nenhuma atividade registrada ainda.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Cabeçalho da tabela */}
            <div style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 160px',
              gap: 16, padding: '8px 16px',
              fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
              textTransform: 'uppercase', letterSpacing: 0.8,
            }}>
              <span>Data / Hora</span>
              <span>Coach</span>
              <span>Ação</span>
              <span>Aluno</span>
              <span>Detalhe</span>
            </div>

            {filtered.map((log, i) => (
              <LogRow key={log.id} log={log} zebra={i % 2 === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LogRow({ log, zebra }: { log: LogEntry; zebra: boolean }) {
  const meta = ACTION_META[log.action_type] ?? { label: log.action_type, color: '#888', icon: <Activity size={14} /> }
  const detail = log.details?.workout_name || log.details?.diet_name || log.details?.name || ''

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 160px',
      gap: 16, padding: '12px 16px', alignItems: 'center',
      backgroundColor: zebra ? 'var(--surface)' : 'transparent',
      borderRadius: 8,
    }}>
      {/* Data */}
      <span style={{ fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(log.created_at)}
      </span>

      {/* Coach */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          backgroundColor: '#E8FF0020', border: '1px solid #E8FF0030',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 900, color: '#E8FF00', flexShrink: 0,
        }}>
          {log.coach.user.name.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {log.coach.user.name}
        </span>
      </div>

      {/* Ação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, fontWeight: 600,
          color: meta.color,
          backgroundColor: meta.color + '18',
          padding: '3px 8px', borderRadius: 20,
          border: `1px solid ${meta.color}30`,
        }}>
          {meta.icon}
          {meta.label}
        </span>
      </div>

      {/* Aluno */}
      <span style={{ fontSize: 13, color: log.student ? 'var(--text)' : 'var(--text-2)' }}>
        {log.student?.user.name ?? '—'}
      </span>

      {/* Detalhe */}
      <span style={{
        fontSize: 12, color: 'var(--text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={detail}>
        {detail || '—'}
      </span>
    </div>
  )
}
