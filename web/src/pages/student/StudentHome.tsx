import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dumbbell, Salad, MessageSquare, CreditCard, ClipboardList, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface HomeData {
  workout: { name: string; valid_to: string } | null
  diet: { name: string } | null
  unreadMessages: number
  pendingPayments: number
  pendingQuestionnaires: number
  lastAssessment: { weight: number; body_fat_pct?: number; created_at: string } | null
  paymentStatus: string | null
  planEnd: string | null
}

const spin = { width:28, height:28, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function StudentHome() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students')
      .select('id, payment_status, plan_end').eq('user_id', user!.id).single()
    if (!student) return

    const [workoutRes, dietRes, msgRes, payRes, qaRes, qrRes, assessRes] = await Promise.all([
      supabase.from('workouts').select('name, valid_to').eq('student_id', student.id).eq('active', true).order('valid_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('diets').select('name').eq('student_id', student.id).eq('active', true).order('valid_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user!.id).is('read_at', null),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('student_id', student.id).eq('status', 'pending'),
      supabase.from('questionnaire_assignments').select('id', { count: 'exact', head: true }).eq('student_id', student.id),
      supabase.from('questionnaire_responses').select('id', { count: 'exact', head: true }).eq('student_id', student.id),
      supabase.from('assessments').select('weight, body_fat_pct, created_at').eq('student_id', student.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    setData({
      workout: workoutRes.data,
      diet: dietRes.data,
      unreadMessages: msgRes.count || 0,
      pendingPayments: payRes.count || 0,
      pendingQuestionnaires: Math.max(0, (qaRes.count || 0) - (qrRes.count || 0)),
      lastAssessment: assessRes.data,
      paymentStatus: student.payment_status,
      planEnd: student.plan_end,
    })
  }

  if (!data) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)' }}><div style={spin} /></div>

  const pad = isMobile ? '20px 16px 48px' : '40px 32px 48px'
  const firstName = user?.name?.split(' ')[0] || ''

  return (
    <div style={{ flex:1, overflowY:'auto', backgroundColor:'var(--bg)' }}>
      <div style={{ padding: pad, maxWidth: 640 }}>

        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:0 }}>Olá, {firstName} 👋</p>
          <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4, textTransform:'capitalize' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
          </p>
        </div>

        {/* Banner pagamento em atraso */}
        {data.paymentStatus === 'overdue' && (
          <div style={{ display:'flex', alignItems:'center', gap:10, backgroundColor:'rgba(255,152,0,0.08)', border:'1px solid rgba(255,152,0,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
            <AlertTriangle size={16} color="#FF9800" />
            <p style={{ fontSize:13, color:'#FF9800', margin:0 }}>Pagamento pendente — acesso pode ser bloqueado em breve.</p>
          </div>
        )}

        {/* Treino */}
        <SectionCard icon={<Dumbbell size={18} color="#E8FF00" />} title="Treino Ativo" onClick={() => navigate('/student/workout')}>
          {data.workout
            ? <><p style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{data.workout.name}</p>
                <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>Válido até {fmt(data.workout.valid_to)}</p></>
            : <p style={{ fontSize:14, color:'var(--text-2)', margin:0 }}>Nenhum treino ativo</p>
          }
        </SectionCard>

        {/* Dieta */}
        <SectionCard icon={<Salad size={18} color="#E8FF00" />} title="Dieta Ativa" onClick={() => navigate('/student/diet')}>
          {data.diet
            ? <p style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>{data.diet.name}</p>
            : <p style={{ fontSize:14, color:'var(--text-2)', margin:0 }}>Nenhuma dieta ativa</p>
          }
        </SectionCard>

        {/* Quick links */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <QuickCard icon={<MessageSquare size={20} color="#E8FF00" />} label="Chat" badge={data.unreadMessages} onClick={() => navigate('/student/chat')} />
          <QuickCard icon={<CreditCard size={20} color="#E8FF00" />} label="Pagamentos" badge={data.pendingPayments} onClick={() => navigate('/student/payments')} />
        </div>

        {/* Questionários pendentes */}
        {data.pendingQuestionnaires > 0 && (
          <button onClick={() => navigate('/student/questionnaires')}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:14, backgroundColor:'rgba(232,255,0,0.07)', border:'1px solid rgba(232,255,0,0.2)', borderRadius:14, padding:'14px 16px', cursor:'pointer', marginBottom:16, textAlign:'left' }}>
            <div style={{ width:36, height:36, borderRadius:18, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ fontSize:15, fontWeight:900, color:'#0A0A0A' }}>{data.pendingQuestionnaires}</span>
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>Questionário{data.pendingQuestionnaires > 1 ? 's' : ''} pendente{data.pendingQuestionnaires > 1 ? 's' : ''}</p>
              <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>Seu coach enviou perguntas para você</p>
            </div>
          </button>
        )}

        {/* Última avaliação */}
        {data.lastAssessment && (
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:16 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:1, margin:'0 0 12px' }}>Última Avaliação</p>
            <div style={{ display:'flex', gap:24 }}>
              <StatItem label="Peso" value={`${data.lastAssessment.weight} kg`} />
              {data.lastAssessment.body_fat_pct && <StatItem label="% Gordura" value={`${data.lastAssessment.body_fat_pct}%`} />}
              <StatItem label="Data" value={new Date(data.lastAssessment.created_at).toLocaleDateString('pt-BR')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCard({ icon, title, children, onClick }: { icon: React.ReactNode; title: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width:'100%', backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:16, cursor:'pointer', textAlign:'left', marginBottom:12 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#E8FF00')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'rgba(232,255,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{title}</span>
        <span style={{ marginLeft:'auto', color:'var(--text-3)', fontSize:18 }}>›</span>
      </div>
      {children}
    </button>
  )
}

function QuickCard({ icon, label, badge, onClick }: { icon: React.ReactNode; label: string; badge: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:16, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, position:'relative' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#E8FF00')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ position:'relative' }}>
        {icon}
        {badge > 0 && (
          <span style={{ position:'absolute', top:-6, right:-8, minWidth:16, height:16, borderRadius:8, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{label}</span>
    </button>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:0 }}>{value}</p>
      <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>{label}</p>
    </div>
  )
}
