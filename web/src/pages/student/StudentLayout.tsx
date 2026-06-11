import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Dumbbell, Salad, MessageSquare, CreditCard, UserCircle, History, LogOut, Sun, Moon, Menu, X, Scale, ClipboardList } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { getTheme, toggleTheme } from '../../store/theme'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function StudentLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(getTheme() === 'dark')
  const [unread, setUnread] = useState(0)
  const [showMenu, setShowMenu] = useState(false)

  const handleToggle = () => { const t = toggleTheme(); setIsDark(t === 'dark') }

  useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      const { count } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id).is('read_at', null)
      setUnread(count || 0)
    }
    fetchUnread()
    const sub = supabase.channel(`student-unread-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any
        if (msg.receiver_id !== user.id) return
        if (!window.location.pathname.startsWith('/student/chat')) setUnread(p => p + 1)
      }).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [user])

  useEffect(() => {
    if (location.pathname.startsWith('/student/chat')) setUnread(0)
    setShowMenu(false)
  }, [location.pathname])

  const navItems = [
    { to: '/student/home',        icon: LayoutDashboard, label: 'Início'      },
    { to: '/student/workout',     icon: Dumbbell,        label: 'Treino'      },
    { to: '/student/diet',        icon: Salad,           label: 'Dieta'       },
    { to: '/student/chat',        icon: MessageSquare,   label: 'Chat',    badge: unread },
    { to: '/student/assessments',    icon: Scale,          label: 'Avaliação'     },
    { to: '/student/questionnaires', icon: ClipboardList, label: 'Questionários' },
    { to: '/student/payments',       icon: CreditCard,    label: 'Pagamentos'    },
    { to: '/student/sessions',    icon: History,         label: 'Histórico'   },
    { to: '/student/profile',     icon: UserCircle,      label: 'Perfil'      },
  ]

  if (isMobile) {
    const bottomItems = navItems.slice(0, 4)
    const moreItems  = navItems.slice(4)

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', backgroundColor:'var(--bg)', overflow:'hidden' }}>
        {/* Header */}
        <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:52, borderBottom:'1px solid var(--border)', flexShrink:0, backgroundColor:'var(--bg)', zIndex:10 }}>
          <img src="/logo.jpeg" alt="Método Acelera!" style={{ height:40, objectFit:'contain' }} />
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={handleToggle} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-2)', padding:8 }}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <Outlet />
        </main>

        {/* Bottom Nav */}
        <nav style={{ display:'flex', alignItems:'stretch', borderTop:'1px solid var(--border)', backgroundColor:'var(--bg)', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom,0px)' }}>
          {bottomItems.map(item => {
            const active = location.pathname.startsWith(item.to)
            return (
              <NavLink key={item.to} to={item.to} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'8px 4px', textDecoration:'none', position:'relative', color: active ? '#E8FF00' : 'var(--text-2)' }}>
                <item.icon size={22} />
                <span style={{ fontSize:10, fontWeight: active ? 700 : 500 }}>{item.label}</span>
                {(item.badge ?? 0) > 0 && (
                  <span style={{ position:'absolute', top:6, left:'50%', marginLeft:6, minWidth:15, height:15, borderRadius:8, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                    {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={() => setShowMenu(v => !v)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'8px 4px', background:'none', border:'none', cursor:'pointer', color: showMenu ? '#E8FF00' : 'var(--text-2)' }}>
            <Menu size={22} />
            <span style={{ fontSize:10, fontWeight: showMenu ? 700 : 500 }}>Mais</span>
          </button>
        </nav>

        {showMenu && (
          <div onClick={() => setShowMenu(false)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width:'100%', backgroundColor:'var(--surface)', borderRadius:'20px 20px 0 0', paddingBottom:'max(24px,env(safe-area-inset-bottom,24px))' }}>
              <div style={{ width:36, height:4, borderRadius:2, backgroundColor:'var(--border)', margin:'12px auto 4px' }} />
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px 16px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', backgroundColor:'#E8FF00', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#0A0A0A', flexShrink:0 }}>
                  {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.name?.charAt(0)}
                </div>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{user?.name}</p>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>Aluno</p>
                </div>
              </div>
              {moreItems.map(item => {
                const active = location.pathname.startsWith(item.to)
                return (
                  <button key={item.to} onClick={() => { navigate(item.to); setShowMenu(false) }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'14px 20px', background: active ? 'rgba(232,255,0,0.07)' : 'none', border:'none', cursor:'pointer', textAlign:'left', borderBottom:'1px solid var(--border)' }}>
                    <item.icon size={20} color={active ? '#E8FF00' : 'var(--text-2)'} />
                    <span style={{ flex:1, fontSize:15, fontWeight: active ? 700 : 500, color: active ? '#E8FF00' : 'var(--text)' }}>{item.label}</span>
                  </button>
                )
              })}
              <div style={{ display:'flex', gap:10, padding:'14px 20px 0' }}>
                <button onClick={() => { handleToggle(); setShowMenu(false) }}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', background:'none', border:'1px solid var(--border)', borderRadius:12, cursor:'pointer', color:'var(--text-2)', fontSize:14 }}>
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? 'Modo Claro' : 'Modo Escuro'}
                </button>
                <button onClick={async () => { await signOut(); navigate('/login') }}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', background:'none', border:'1px solid var(--border)', borderRadius:12, cursor:'pointer', color:'#FF4444', fontSize:14 }}>
                  <LogOut size={16} /> Sair
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop
  return (
    <div style={{ display:'flex', height:'100vh', backgroundColor:'var(--bg)', overflow:'hidden' }}>
      <aside style={{ width:220, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid var(--border)' }}>
          <img src="/logo.jpeg" alt="Método Acelera!" style={{ height:80, objectFit:'contain', objectPosition:'left', maxWidth:'100%' }} />
          <p style={{ fontSize:11, color:'var(--text-2)', margin:'4px 0 0' }}>Área do Aluno</p>
        </div>

        <nav style={{ flex:1, padding:'16px 10px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:8,
                fontSize:14, fontWeight:500, textDecoration:'none', transition:'all 0.15s',
                backgroundColor: isActive ? '#E8FF00' : 'transparent',
                color: isActive ? '#0A0A0A' : '#888',
                position:'relative',
              })}
              onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; if (el.getAttribute('aria-current') !== 'page') { el.style.color='#fff'; el.style.backgroundColor='#111' } }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; if (el.getAttribute('aria-current') !== 'page') { el.style.color='#888'; el.style.backgroundColor='transparent' } }}
            >
              <item.icon size={18} />
              <span style={{ flex:1 }}>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span style={{ minWidth:18, height:18, borderRadius:9, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                  {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding:16, borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:34, height:34, borderRadius:'50%', backgroundColor:'#E8FF00', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#0A0A0A', flexShrink:0 }}>
              {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.name?.charAt(0)}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</p>
              <p style={{ fontSize:11, color:'var(--text-2)', margin:0 }}>Aluno</p>
            </div>
          </div>
          <button onClick={handleToggle} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', fontSize:13, color:'var(--text-2)', background:'none', border:'none', borderRadius:8, cursor:'pointer', textAlign:'left', marginBottom:2 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor='var(--surface-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor='transparent' }}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? 'Modo Claro' : 'Modo Escuro'}
          </button>
          <button onClick={async () => { await signOut(); navigate('/login') }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', fontSize:13, color:'var(--text-2)', background:'none', border:'none', borderRadius:8, cursor:'pointer', textAlign:'left' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color='#FF4444'; (e.currentTarget as HTMLElement).style.backgroundColor='var(--surface-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color='var(--text-2)'; (e.currentTarget as HTMLElement).style.backgroundColor='transparent' }}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      </aside>

      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Outlet />
      </main>
    </div>
  )
}
