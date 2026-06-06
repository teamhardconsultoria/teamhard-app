import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trophy, Timer, Dumbbell, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const FATIGUE_LABELS = ['', 'Fácil', 'Tranquilo', 'Moderado', 'Puxado', 'Esgotante']
const FATIGUE_ICONS  = ['', '😴', '🙂', '😅', '😤', '🥵']

function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min${s > 0 ? ` ${s}s` : ''}`
  return `${s}s`
}

interface Stats {
  workoutName: string
  dayName: string
  durationSeconds: number
  exerciseCount: number
  setCount: number
  fatigue: number
}

const spin: React.CSSProperties = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

export default function StudentWorkoutSummary() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!sessionId) { setLoading(false); return }
      const [sessionRes, setsRes, feedbackRes] = await Promise.all([
        supabase.from('training_sessions')
          .select('duration_seconds, workout_day:workout_days(name, workout:workouts(name))')
          .eq('id', sessionId).single(),
        supabase.from('session_sets').select('exercise_id').eq('session_id', sessionId),
        supabase.from('training_feedbacks').select('fatigue_level').eq('session_id', sessionId).maybeSingle(),
      ])
      const session = sessionRes.data as any
      const sets = setsRes.data || []
      setStats({
        workoutName: session?.workout_day?.workout?.name || 'Treino',
        dayName: session?.workout_day?.name || '',
        durationSeconds: session?.duration_seconds || 0,
        exerciseCount: new Set(sets.map((s: any) => s.exercise_id)).size,
        setCount: sets.length,
        fatigue: feedbackRes.data?.fatigue_level || 0,
      })
      setLoading(false)
    }
    load()
  }, [sessionId])

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  return (
    <div style={{ flex:1, overflowY:'auto', backgroundColor:'var(--bg)' }}>
      <div style={{ padding:'40px 24px 48px', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>

        {/* Card de resultado */}
        <div style={{ width:'100%', backgroundColor:'var(--surface)', border:'1px solid rgba(232,255,0,0.3)', borderRadius:24, padding:32, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
          <div style={{ width:80, height:80, borderRadius:40, backgroundColor:'rgba(232,255,0,0.1)', border:'2px solid rgba(232,255,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Trophy size={40} color="#E8FF00" />
          </div>
          <div style={{ textAlign:'center' }}>
            <h1 style={{ fontSize:26, fontWeight:900, color:'var(--text)', margin:'0 0 6px' }}>Treino Concluído!</h1>
            <p style={{ fontSize:13, color:'var(--text-2)', margin:0 }}>
              {stats?.workoutName}{stats?.dayName ? ` · ${stats.dayName}` : ''}
            </p>
          </div>

          {/* Estatísticas */}
          <div style={{ width:'100%', display:'flex', alignItems:'center', backgroundColor:'var(--bg)', borderRadius:16, border:'1px solid var(--border)', padding:'14px 8px', marginTop:4 }}>
            <StatCol icon={<Timer size={20} color="#E8FF00" />} value={formatDuration(stats?.durationSeconds || 0)} label="Duração" />
            <div style={{ width:1, height:36, backgroundColor:'var(--border)' }} />
            <StatCol icon={<Dumbbell size={20} color="#E8FF00" />} value={String(stats?.exerciseCount || 0)} label="Exercícios" />
            <div style={{ width:1, height:36, backgroundColor:'var(--border)' }} />
            <StatCol icon={<CheckCircle size={20} color="#E8FF00" />} value={String(stats?.setCount || 0)} label="Séries" />
          </div>

          {stats?.fatigue ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>{FATIGUE_ICONS[stats.fatigue]}</span>
              <span style={{ fontSize:14, color:'var(--text-2)', fontWeight:600 }}>{FATIGUE_LABELS[stats.fatigue]}</span>
            </div>
          ) : null}
        </div>

        <button onClick={() => navigate('/student/workout')}
          style={{ width:'100%', backgroundColor:'#E8FF00', border:'none', borderRadius:12, padding:'16px', cursor:'pointer', fontSize:15, fontWeight:800, color:'#0A0A0A', letterSpacing:1 }}>
          Voltar para Treinos
        </button>
        <button onClick={() => navigate('/student/home')}
          style={{ width:'100%', background:'none', border:'1px solid var(--border)', borderRadius:12, padding:'14px', cursor:'pointer', fontSize:14, fontWeight:600, color:'var(--text-2)' }}>
          Ir para Home
        </button>
      </div>
    </div>
  )
}

function StatCol({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      {icon}
      <span style={{ fontSize:20, fontWeight:900, color:'var(--text)' }}>{value}</span>
      <span style={{ fontSize:9, color:'var(--text-2)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</span>
    </div>
  )
}
