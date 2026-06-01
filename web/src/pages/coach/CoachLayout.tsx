import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, CreditCard,
  ClipboardList, LogOut, Settings, Star, FileText, Sun, Moon, Bell, Zap, UserCircle,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/auth'
import { getTheme, toggleTheme } from '../../store/theme'
import { supabase } from '../../lib/supabase'

const LS_ASSESSMENTS = 'coach_assessments_last_seen'
const LS_QUESTIONNAIRES = 'coach_questionnaires_last_seen'

export default function CoachLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [isDark, setIsDark] = useState(getTheme() === 'dark')
  const [newAssessments, setNewAssessments] = useState(0)
  const [newMessages, setNewMessages] = useState(0)
  const [newFeedbacks, setNewFeedbacks] = useState(0)
  const [newQuestionnaires, setNewQuestionnaires] = useState(0)
  const [showBell, setShowBell] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const coachIdRef = useRef<string | null>(null)
  const handleToggle = () => { const t = toggleTheme(); setIsDark(t === 'dark') }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBell(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const subs: any[] = []

    const init = async () => {
      let { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      if (!coach && user?.role === 'super_admin') {
        const { data: created } = await supabase.from('coaches').insert({ user_id: user!.id }).select('id').single()
        coach = created
      }
      if (!coach) return
      coachIdRef.current = coach.id

      const { data: students } = await supabase.from('students').select('id').eq('coach_id', coach.id)
      const studentIds = (students || []).map((s: any) => s.id)

      const { data: questionnaires } = await supabase.from('questionnaires').select('id').eq('coach_id', coach.id)
      const questionnaireIds = (questionnaires || []).map((q: any) => q.id)

      const lastSeenAssess = localStorage.getItem(LS_ASSESSMENTS) || new Date(0).toISOString()
      const lastSeenQ = localStorage.getItem(LS_QUESTIONNAIRES) || new Date(0).toISOString()

      const [assessRes, msgRes, fbRes, qRes] = await Promise.all([
        supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('coach_id', coach.id).gt('created_at', lastSeenAssess),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user!.id).is('read_at', null),
        studentIds.length > 0
          ? supabase.from('training_feedbacks').select('id', { count: 'exact', head: true }).in('student_id', studentIds).eq('read_by_coach', false)
          : Promise.resolve({ count: 0 }),
        questionnaireIds.length > 0
          ? supabase.from('questionnaire_responses').select('id', { count: 'exact', head: true }).in('questionnaire_id', questionnaireIds).gt('submitted_at', lastSeenQ)
          : Promise.resolve({ count: 0 }),
      ])

      setNewAssessments(assessRes.count || 0)
      setNewMessages(msgRes.count || 0)
      setNewFeedbacks(fbRes.count || 0)
      setNewQuestionnaires(qRes.count || 0)

      // Realtime: avaliações
      const subAssess = supabase.channel('rt-assessments')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assessments', filter: `coach_id=eq.${coach.id}` }, () => {
          setNewAssessments(p => p + 1)
        }).subscribe()

      // Realtime: mensagens
      const subMsg = supabase.channel('rt-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user!.id}` }, () => {
          setNewMessages(p => p + 1)
        }).subscribe()

      // Realtime: feedbacks
      const subFb = supabase.channel('rt-feedbacks')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'training_feedbacks' }, (payload) => {
          if (studentIds.includes(payload.new.student_id)) setNewFeedbacks(p => p + 1)
        }).subscribe()

      // Realtime: respostas de questionários
      const subQ = supabase.channel('rt-questionnaires')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questionnaire_responses' }, (payload) => {
          if (questionnaireIds.includes(payload.new.questionnaire_id)) setNewQuestionnaires(p => p + 1)
        }).subscribe()

      subs.push(subAssess, subMsg, subFb, subQ)
    }

    init()
    return () => { subs.forEach(s => s?.unsubscribe()) }
  }, [])

  // Zerar badges ao navegar para a página correspondente
  useEffect(() => {
    const path = location.pathname
    if (path === '/coach/assessments') {
      localStorage.setItem(LS_ASSESSMENTS, new Date().toISOString())
      setNewAssessments(0)
    }
    if (path === '/coach/chat') {
      setNewMessages(0)
    }
    if (path === '/coach/feedbacks') {
      setNewFeedbacks(0)
    }
    if (path === '/coach/questionnaires') {
      localStorage.setItem(LS_QUESTIONNAIRES, new Date().toISOString())
      setNewQuestionnaires(0)
    }
  }, [location.pathname])

  const totalNotifications = newAssessments + newMessages + newFeedbacks + newQuestionnaires

  const navItems = [
    { to: '/coach/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/coach/students',       icon: Users,           label: 'Alunos' },
    { to: '/coach/feedbacks',      icon: Star,            label: 'Feedbacks',     badge: newFeedbacks },
    { to: '/coach/questionnaires', icon: FileText,        label: 'Questionários', badge: newQuestionnaires },
    { to: '/coach/assessments',    icon: ClipboardList,   label: 'Avaliações',    badge: newAssessments },
    { to: '/coach/chat',           icon: MessageSquare,   label: 'Chat',          badge: newMessages },
    { to: '/coach/payments',       icon: CreditCard,      label: 'Pagamentos' },
    { to: '/coach/auto-messages',  icon: Zap,             label: 'Msgs Automáticas' },
    { to: '/coach/profile',        icon: UserCircle,      label: 'Meu Perfil' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 232, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Logo + sino */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <img src="/logo.png" alt="Team Hard" style={{ height: 100, objectFit: 'contain', objectPosition: 'left', display: 'block', maxWidth: '100%' }} />
            <div ref={bellRef} style={{ position: 'relative', flexShrink: 0, marginTop: 4 }}>
              <button
                onClick={() => setShowBell(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: totalNotifications > 0 ? '#E8FF00' : 'var(--text-2)', padding: 4 }}
                title="Notificações"
              >
                <Bell size={20} />
              </button>
              {totalNotifications > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  minWidth: 17, height: 17, borderRadius: 9,
                  backgroundColor: '#E8FF00', color: '#0A0A0A',
                  fontSize: 9, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', pointerEvents: 'none',
                }}>
                  {totalNotifications > 99 ? '99+' : totalNotifications}
                </span>
              )}

              {/* Dropdown */}
              {showBell && (
                <div style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 100,
                  backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  minWidth: 220, overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, padding: '12px 14px 8px', margin: 0 }}>
                    Notificações
                  </p>
                  {totalNotifications === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '8px 14px 14px', margin: 0 }}>Nenhuma notificação nova.</p>
                  ) : (
                    <div>
                      {[
                        { label: 'Avaliações', count: newAssessments, icon: ClipboardList, path: '/coach/assessments' },
                        { label: 'Feedbacks', count: newFeedbacks, icon: Star, path: '/coach/feedbacks' },
                        { label: 'Questionários', count: newQuestionnaires, icon: FileText, path: '/coach/questionnaires' },
                        { label: 'Mensagens', count: newMessages, icon: MessageSquare, path: '/coach/chat' },
                      ].filter(n => n.count > 0).map(n => (
                        <button
                          key={n.path}
                          onClick={() => { navigate(n.path); setShowBell(false) }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', background: 'none', border: 'none',
                            cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--border)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <n.icon size={15} color="var(--text-2)" />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{n.label}</span>
                          <span style={{
                            minWidth: 20, height: 20, borderRadius: 10,
                            backgroundColor: '#E8FF00', color: '#0A0A0A',
                            fontSize: 11, fontWeight: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                          }}>
                            {n.count > 99 ? '99+' : n.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '4px 0 0 0' }}>Painel do Coach</p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                textDecoration: 'none', transition: 'all 0.15s',
                backgroundColor: isActive ? '#E8FF00' : 'transparent',
                color: isActive ? '#0A0A0A' : '#888',
              })}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                if (el.getAttribute('aria-current') !== 'page') {
                  el.style.color = '#fff'; el.style.backgroundColor = '#111'
                }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                if (el.getAttribute('aria-current') !== 'page') {
                  el.style.color = '#888'; el.style.backgroundColor = 'transparent'
                }
              }}
            >
              <item.icon size={18} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {(item.badge ?? 0) > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          ))}

          {user?.role === 'super_admin' && (
            <>
              <div style={{ margin: '8px 0', height: 1, backgroundColor: 'var(--border)' }} />
              <NavLink
                to="/admin"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', color: 'var(--text-2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.backgroundColor = '#111' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                <Settings size={18} />
                Admin
              </NavLink>
            </>
          )}
        </nav>

        {/* User */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#E8FF00', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : user?.name?.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{user?.role === 'super_admin' ? 'Super Admin' : 'Coach'}</p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text-2)', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            {isDark ? 'Modo Claro' : 'Modo Escuro'}
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text-2)', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  )
}
