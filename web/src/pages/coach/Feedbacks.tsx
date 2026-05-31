import { useEffect, useState } from 'react'
import { Flame, AlertTriangle, Dumbbell, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Student { id: string; name: string; email: string; unread: number }

interface Feedback {
  id: string; fatigue_level: number; has_pain: boolean
  pain_description?: string; notes?: string; difficult_exercise_notes?: string
  created_at: string
  session: { started_at: string; duration_seconds?: number; day: { name: string; workout: { name: string } } }
  difficult_exercise?: { name: string }
}

const FATIGUE_LABEL: Record<number, string> = { 1:'Muito leve', 2:'Leve', 3:'Moderado', 4:'Intenso', 5:'Exaustivo' }
const FATIGUE_COLOR: Record<number, string> = { 1:'#00C853', 2:'#00C853', 3:'#FF9800', 4:'#FF9800', 5:'#FF4444' }

const spin = { width:24, height:24, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

export default function Feedbacks() {
  const { user } = useAuthStore()
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoadingStudents(false); return }
    const { data: rows } = await supabase.from('students').select('id, user:users(name, email)').eq('coach_id', coach.id).order('created_at', { ascending: false })
    if (!rows) { setLoadingStudents(false); return }
    const list: Student[] = await Promise.all(rows.map(async (s: any) => {
      const { count } = await supabase.from('training_feedbacks').select('id', { count:'exact', head:true }).eq('student_id', s.id).eq('read_by_coach', false)
      return { id: s.id, name: s.user.name, email: s.user.email, unread: count || 0 }
    }))
    list.sort((a, b) => b.unread - a.unread)
    setStudents(list)
    setLoadingStudents(false)
  }

  const selectStudent = async (student: Student) => {
    setSelected(student); setFeedbacks([]); setLoadingFeedbacks(true)
    const { data } = await supabase.from('training_feedbacks').select(`
      id, fatigue_level, has_pain, pain_description, notes, difficult_exercise_notes, created_at,
      session:training_sessions(started_at, duration_seconds, day:workout_days(name, workout:workouts(name))),
      difficult_exercise:exercises(name)
    `).eq('student_id', student.id).order('created_at', { ascending: false })
    setFeedbacks((data || []).map((f: any) => ({
      ...f,
      session: { ...f.session, day: Array.isArray(f.session?.day) ? f.session.day[0] : f.session?.day },
      difficult_exercise: Array.isArray(f.difficult_exercise) ? f.difficult_exercise[0] : f.difficult_exercise,
    })))
    setLoadingFeedbacks(false)
    if (student.unread > 0) {
      await supabase.from('training_feedbacks').update({ read_by_coach: true }).eq('student_id', student.id).eq('read_by_coach', false)
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, unread: 0 } : s))
    }
  }

  const totalUnread = students.reduce((a, s) => a + s.unread, 0)

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', backgroundColor:'var(--bg)' }}>
      {/* Sidebar */}
      <div style={{ width:280, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h1 style={{ fontSize:18, fontWeight:900, color:'var(--text)', margin:0 }}>Feedbacks</h1>
            {totalUnread > 0 && (
              <span style={{ backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:11, fontWeight:900, padding:'2px 8px', borderRadius:20 }}>
                {totalUnread} novo{totalUnread !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize:12, color:'var(--text-2)', marginTop:2 }}>Respostas após os treinos</p>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loadingStudents ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
          ) : students.length === 0 ? (
            <p style={{ color:'var(--text-2)', fontSize:14, textAlign:'center', padding:'40px 16px' }}>Nenhum aluno cadastrado.</p>
          ) : students.map(s => (
            <SidebarRow key={s.id} name={s.name} email={s.email} isSelected={selected?.id === s.id} onClick={() => selectStudent(s)}
              badge={s.unread > 0 ? String(s.unread) : undefined} />
          ))}
        </div>
      </div>

      {/* Painel direito */}
      {selected ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <Avatar name={selected.name} />
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{selected.name}</p>
              <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{feedbacks.length} feedback{feedbacks.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            {loadingFeedbacks ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
            ) : feedbacks.length === 0 ? (
              <Empty icon={<MessageSquare size={24} color="#888" />} title="Nenhum feedback ainda" sub="O aluno ainda não completou nenhum treino pelo app." />
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:640 }}>
                {feedbacks.map(fb => <FeedbackCard key={fb.id} feedback={fb} />)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Empty icon={<MessageSquare size={24} color="#888" />} title="Selecione um aluno" sub="Veja os feedbacks dos treinos" />
        </div>
      )}
    </div>
  )
}

function FeedbackCard({ feedback: fb }: { feedback: Feedback }) {
  const dur = fb.session?.duration_seconds ? `${Math.floor(fb.session.duration_seconds / 60)} min` : null
  const dayName = fb.session?.day?.name
  const workoutName = fb.session?.day?.workout?.name
  const color = FATIGUE_COLOR[fb.fatigue_level]

  return (
    <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', backgroundColor:'var(--bg)' }}>
        <div>
          <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>
            {new Date(fb.created_at).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
          </p>
          {workoutName && (
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text)', margin:'2px 0 0 0' }}>
              {workoutName}{dayName && <span style={{ color:'var(--text-2)', fontWeight:400 }}> — Divisão {dayName}</span>}
            </p>
          )}
        </div>
        {dur && <span style={{ fontSize:12, color:'var(--text-2)' }}>{dur}</span>}
      </div>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
        {/* Fadiga */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Flame size={15} color={color} />
          <div>
            <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>Nível de fadiga</p>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
              <div style={{ display:'flex', gap:3 }}>
                {[1,2,3,4,5].map(n => (
                  <div key={n} style={{ width:16, height:6, borderRadius:3, backgroundColor: n <= fb.fatigue_level ? color : 'var(--border)' }} />
                ))}
              </div>
              <span style={{ fontSize:12, fontWeight:600, color }}>{FATIGUE_LABEL[fb.fatigue_level]}</span>
            </div>
          </div>
        </div>

        {/* Dor */}
        {fb.has_pain && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:10, backgroundColor:'rgba(255,68,68,0.05)', border:'1px solid rgba(255,68,68,0.2)', borderRadius:8, padding:'10px 12px' }}>
            <AlertTriangle size={14} color="#FF4444" style={{ flexShrink:0, marginTop:1 }} />
            <div>
              <p style={{ fontSize:12, fontWeight:600, color:'#FF4444', margin:0 }}>Relatou dor ou desconforto</p>
              {fb.pain_description && <p style={{ fontSize:12, color:'var(--text-2)', margin:'3px 0 0 0' }}>{fb.pain_description}</p>}
            </div>
          </div>
        )}

        {/* Exercício difícil */}
        {fb.difficult_exercise && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <Dumbbell size={14} color="#888" style={{ flexShrink:0, marginTop:1 }} />
            <div>
              <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>Exercício com dificuldade</p>
              <p style={{ fontSize:13, fontWeight:500, color:'var(--text)', margin:'2px 0 0 0' }}>{fb.difficult_exercise.name}</p>
              {fb.difficult_exercise_notes && <p style={{ fontSize:12, color:'var(--text-2)', margin:'2px 0 0 0' }}>{fb.difficult_exercise_notes}</p>}
            </div>
          </div>
        )}

        {/* Notas */}
        {fb.notes && (
          <div style={{ backgroundColor:'var(--bg)', borderRadius:8, padding:'10px 12px' }}>
            <p style={{ fontSize:11, color:'var(--text-2)', margin:'0 0 4px 0' }}>Observações</p>
            <p style={{ fontSize:13, color:'var(--text)', margin:0, whiteSpace:'pre-wrap' }}>{fb.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SidebarRow({ name, email, isSelected, onClick, badge }: { name:string; email:string; isSelected:boolean; onClick:()=>void; badge?:string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', width:'100%', textAlign:'left', backgroundColor: isSelected || hovered ? 'var(--surface-hover)' : 'transparent', borderBottom:'1px solid var(--border)', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer' }}>
      <Avatar name={name} size={36} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
        <p style={{ fontSize:12, color:'var(--text-2)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email}</p>
      </div>
      {badge && (
        <span style={{ width:20, height:20, borderRadius:10, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{badge}</span>
      )}
    </button>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:size/2, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:size*0.4, fontWeight:900, color:'#0A0A0A' }}>
      {name.charAt(0)}
    </div>
  )
}

function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ width:64, height:64, borderRadius:32, backgroundColor:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>{icon}</div>
      <p style={{ color:'var(--text)', fontWeight:600, fontSize:14, margin:0 }}>{title}</p>
      <p style={{ color:'var(--text-2)', fontSize:13, marginTop:6 }}>{sub}</p>
    </div>
  )
}
