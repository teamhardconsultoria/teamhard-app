import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

const FATIGUE_ICONS  = ['😴', '🙂', '😅', '😤', '🥵']
const FATIGUE_LABELS = ['Fácil', 'Tranquilo', 'Moderado', 'Puxado', 'Esgotante']

export default function StudentWorkoutFeedback() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [fatigue, setFatigue] = useState(2)
  const [hasPain, setHasPain] = useState(false)
  const [painDesc, setPainDesc] = useState('')
  const [notes, setNotes] = useState('')
  const [hasDifficulty, setHasDifficulty] = useState(false)
  const [difficultyNotes, setDifficultyNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
      await supabase.from('training_feedbacks').insert({
        session_id: sessionId,
        student_id: student!.id,
        fatigue_level: fatigue,
        has_pain: hasPain,
        pain_description: hasPain ? painDesc : null,
        notes: notes || null,
        difficult_exercise_notes: hasDifficulty ? difficultyNotes : null,
      })
      navigate(`/student/workout/summary/${sessionId}`)
    } finally {
      setLoading(false)
    }
  }

  const yesNoBtn = (active: boolean, variant: 'yellow' | 'red' = 'yellow'): React.CSSProperties => ({
    flex: 1,
    padding: '12px',
    borderRadius: 10,
    border: `1px solid ${active ? (variant === 'red' ? '#FF4444' : '#E8FF00') : 'var(--border)'}`,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    backgroundColor: active
      ? variant === 'red' ? 'rgba(255,68,68,0.1)' : 'rgba(232,255,0,0.1)'
      : 'var(--surface)',
    color: active ? (variant === 'red' ? '#FF4444' : '#E8FF00') : 'var(--text-2)',
  })

  const textarea: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: 'var(--text)',
    width: '100%',
    minHeight: 80,
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', backgroundColor:'var(--bg)', overflow:'hidden' }}>
      <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <h1 style={{ fontSize:24, fontWeight:900, color:'var(--text)', margin:'0 0 4px' }}>Como foi o treino?</h1>
        <p style={{ fontSize:14, color:'var(--text-2)', margin:0 }}>Seu feedback ajuda o coach a ajustar seu treino.</p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:28 }}>

        {/* Nível de cansaço */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>Nível de cansaço</p>
          <div style={{ display:'flex', gap:8 }}>
            {FATIGUE_ICONS.map((icon, i) => (
              <button key={i} onClick={() => setFatigue(i + 1)}
                style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 4px', gap:6, backgroundColor: fatigue === i+1 ? 'rgba(232,255,0,0.08)' : 'var(--surface)', border:`1px solid ${fatigue === i+1 ? '#E8FF00' : 'var(--border)'}`, borderRadius:12, cursor:'pointer' }}>
                <span style={{ fontSize:22 }}>{icon}</span>
                <span style={{ fontSize:10, color: fatigue === i+1 ? '#E8FF00' : 'var(--text-2)', fontWeight:600, textAlign:'center' }}>{FATIGUE_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dor */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>Sentiu alguma dor ou desconforto?</p>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setHasPain(false)} style={yesNoBtn(!hasPain)}>Não</button>
            <button onClick={() => setHasPain(true)} style={yesNoBtn(hasPain, 'red')}>Sim</button>
          </div>
          {hasPain && (
            <textarea value={painDesc} onChange={e => setPainDesc(e.target.value)}
              placeholder="Onde doeu? Como foi a dor?" style={textarea} />
          )}
        </div>

        {/* Dificuldade */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>Teve dificuldade com algum exercício?</p>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setHasDifficulty(false)} style={yesNoBtn(!hasDifficulty)}>Não</button>
            <button onClick={() => setHasDifficulty(true)} style={yesNoBtn(hasDifficulty)}>Sim</button>
          </div>
          {hasDifficulty && (
            <textarea value={difficultyNotes} onChange={e => setDifficultyNotes(e.target.value)}
              placeholder="Qual exercício? O que aconteceu?" style={textarea} />
          )}
        </div>

        {/* Observações */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>Observações gerais</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Algum comentário para o seu coach?" style={{ ...textarea, minHeight:100 }} />
        </div>

        {/* Espaço para o botão fixo */}
        <div style={{ height:80 }} />
      </div>

      <div style={{ padding:'16px 20px', borderTop:'1px solid var(--border)', backgroundColor:'var(--bg)', flexShrink:0 }}>
        <button onClick={handleSubmit} disabled={loading}
          style={{ width:'100%', backgroundColor:'#E8FF00', border:'none', borderRadius:12, padding:'16px', cursor: loading ? 'not-allowed' : 'pointer', fontSize:15, fontWeight:800, color:'#0A0A0A', letterSpacing:2, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Salvando...' : 'ENVIAR FEEDBACK'}
        </button>
      </div>
    </div>
  )
}
