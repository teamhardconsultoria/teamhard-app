import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, CreditCard,
  ClipboardList, LogOut, Settings, Star, FileText, Sun, Moon, Bell, Zap, UserCircle, Menu, Target,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'
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

  const isMobile = useIsMobile()
  const [showMore, setShowMore] = useState(false)

  useEffect(() => { setShowMore(false) }, [location.pathname])

  const totalNotifications = newAssessments + newMessages + newFeedbacks + newQuestionnaires

  const navItems = [
    { to: '/coach/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/coach/students',       icon: Users,           label: 'Alunos' },
    { to: '/coach/leads',          icon: Target,          label: 'CRM / Leads' },
    { to: '/coach/feedbacks',      icon: Star,            label: 'Feedbacks',     badge: newFeedbacks },
    { to: '/coach/questionnaires', icon: FileText,        label: 'Questionários', badge: newQuestionnaires },
    { to: '/coach/assessments',    icon: ClipboardList,   label: 'Avaliações',    badge: newAssessments },
    { to: '/coach/chat',           icon: MessageSquare,   label: 'Chat',          badge: newMessages },
    { to: '/coach/payments',       icon: CreditCard,      label: 'Pagamentos' },
    { to: '/coach/auto-messages',  icon: Zap,             label: 'Msgs Automáticas' },
    { to: '/coach/profile',        icon: UserCircle,      label: 'Meu Perfil' },
  ]

  // ── Layout Mobile ──────────────────────────────────────────────
  if (isMobile) {
    const bottomPrimary = [
      { to: '/coach/dashboard',   icon: LayoutDashboard, label: 'Dashboard', badge: 0 },
      { to: '/coach/students',    icon: Users,           label: 'Alunos',    badge: 0 },
      { to: '/coach/chat',        icon: MessageSquare,   label: 'Chat',      badge: newMessages },
      { to: '/coach/assessments', icon: ClipboardList,   label: 'Avaliações',badge: newAssessments },
    ]
    const moreItems = [
      { to: '/coach/leads',          icon: Target,     label: 'CRM / Leads',      badge: 0 },
      { to: '/coach/feedbacks',      icon: Star,       label: 'Feedbacks',        badge: newFeedbacks },
      { to: '/coach/questionnaires', icon: FileText,   label: 'Questionários',    badge: newQuestionnaires },
      { to: '/coach/payments',       icon: CreditCard, label: 'Pagamentos',       badge: 0 },
      { to: '/coach/auto-messages',  icon: Zap,        label: 'Msgs Automáticas', badge: 0 },
      { to: '/coach/profile',        icon: UserCircle, label: 'Meu Perfil',       badge: 0 },
    ]
    const moreBadge = newFeedbacks + newQuestionnaires
    const isMoreActive = moreItems.some(i => location.pathname.startsWith(i.to))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>

        {/* ── Top Header ── */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 52, borderBottom: '1px solid var(--border)', flexShrink: 0, backgroundColor: 'var(--bg)', zIndex: 10 }}>
          <img src="/logo.jpeg" alt="Método Acelera!" style={{ height: 44, objectFit: 'contain' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={handleToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 8 }}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div ref={bellRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowBell(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: totalNotifications > 0 ? '#E8FF00' : 'var(--text-2)', padding: 8 }}>
                <Bell size={20} />
              </button>
              {totalNotifications > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', pointerEvents: 'none' }}>
                  {totalNotifications > 99 ? '99+' : totalNotifications}
                </span>
              )}
              {showBell && (
                <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 200, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: 240, overflow: 'hidden' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, padding: '12px 14px 8px', margin: 0 }}>Notificações</p>
                  {totalNotifications === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '8px 14px 14px', margin: 0 }}>Nenhuma nova.</p>
                  ) : (
                    [
                      { label: 'Avaliações', count: newAssessments, icon: ClipboardList, path: '/coach/assessments' },
                      { label: 'Feedbacks', count: newFeedbacks, icon: Star, path: '/coach/feedbacks' },
                      { label: 'Questionários', count: newQuestionnaires, icon: FileText, path: '/coach/questionnaires' },
                      { label: 'Mensagens', count: newMessages, icon: MessageSquare, path: '/coach/chat' },
                    ].filter(n => n.count > 0).map(n => (
                      <button key={n.path} onClick={() => { navigate(n.path); setShowBell(false) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <n.icon size={15} color="var(--text-2)" />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{n.label}</span>
                        <span style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                          {n.count > 99 ? '99+' : n.count}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>

        {/* ── Bottom Nav ── */}
        <nav style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg)', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {bottomPrimary.map(item => {
            const active = location.pathname.startsWith(item.to)
            return (
              <NavLink key={item.to} to={item.to} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 4px', textDecoration: 'none', position: 'relative', color: active ? '#E8FF00' : 'var(--text-2)' }}>
                <item.icon size={22} />
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.2 }}>{item.label}</span>
                {item.badge > 0 && (
                  <span style={{ position: 'absolute', top: 6, left: '50%', marginLeft: 6, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={() => setShowMore(v => !v)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative', color: isMoreActive || showMore ? '#E8FF00' : 'var(--text-2)' }}>
            <Menu size={22} />
            <span style={{ fontSize: 10, fontWeight: isMoreActive || showMore ? 700 : 500 }}>Mais</span>
            {moreBadge > 0 && (
              <span style={{ position: 'absolute', top: 6, left: '50%', marginLeft: 6, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {moreBadge > 99 ? '99+' : moreBadge}
              </span>
            )}
          </button>
        </nav>

        {/* ── Drawer "Mais" ── */}
        {showMore && (
          <div onClick={() => setShowMore(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', backgroundColor: 'var(--surface)', borderRadius: '20px 20px 0 0', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))', overflow: 'hidden' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'var(--border)', margin: '12px auto 4px' }} />
              {/* User info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#E8FF00', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
                  {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.name?.charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{user?.role === 'super_admin' ? 'Super Admin' : 'Coach'}</p>
                </div>
              </div>
              {/* Nav items */}
              {moreItems.map(item => {
                const active = location.pathname.startsWith(item.to)
                return (
                  <button key={item.to} onClick={() => { navigate(item.to); setShowMore(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: active ? 'rgba(232,255,0,0.07)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <item.icon size={20} color={active ? '#E8FF00' : 'var(--text-2)'} />
                    <span style={{ flex: 1, fontSize: 15, fontWeight: active ? 700 : 500, color: active ? '#E8FF00' : 'var(--text)' }}>{item.label}</span>
                    {item.badge > 0 && (
                      <span style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
              {user?.role === 'super_admin' && (
                <button onClick={() => { navigate('/admin'); setShowMore(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <Settings size={20} color="var(--text-2)" />
                  <span style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>Admin</span>
                </button>
              )}
              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
                <button onClick={() => { handleToggle(); setShowMore(false) }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: 'none', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', color: 'var(--text-2)', fontSize: 14 }}>
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? 'Modo Claro' : 'Modo Escuro'}
                </button>
                <button onClick={async () => { await signOut(); navigate('/login') }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: 'none', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', color: '#FF4444', fontSize: 14 }}>
                  <LogOut size={16} /> Sair
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Layout Desktop ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 232, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Logo + sino */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <img src="/logo.jpeg" alt="Método Acelera!" style={{ height: 100, objectFit: 'contain', objectPosition: 'left', display: 'block', maxWidth: '100%' }} />
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
