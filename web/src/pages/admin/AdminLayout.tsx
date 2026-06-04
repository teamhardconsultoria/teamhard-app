import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Dumbbell, FileText, LogOut, ArrowLeft, Users, Sun, Moon, Headphones, ScrollText, Settings2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { getTheme, toggleTheme } from '../../store/theme'
import { supabase } from '../../lib/supabase'

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/coaches', icon: Users, label: 'Coaches' },
  { to: '/admin/exercises', icon: Dumbbell, label: 'Exercícios' },
  { to: '/admin/templates', icon: FileText, label: 'Templates' },
  { to: '/admin/support', icon: Headphones, label: 'Suporte' },
  { to: '/admin/activity', icon: ScrollText, label: 'Atividades' },
  { to: '/admin/settings', icon: Settings2, label: 'Configurações' },
]

const btnStyle = (hover: boolean): React.CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', fontSize: 14, background: 'none', border: 'none',
  borderRadius: 8, cursor: 'pointer', textAlign: 'left',
  color: hover ? 'var(--text)' : 'var(--text-2)',
  backgroundColor: hover ? 'var(--surface-hover)' : 'transparent',
})

export default function AdminLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(getTheme() === 'dark')
  const [hoverTheme, setHoverTheme] = useState(false)
  const [hoverSignout, setHoverSignout] = useState(false)

  const handleToggle = () => { const t = toggleTheme(); setIsDark(t === 'dark') }

  useEffect(() => {
    supabase.from('coaches').select('id').eq('user_id', user!.id).single().then(({ data }) => {
      if (!data) supabase.from('coaches').insert({ user_id: user!.id }).then(() => {})
    })
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 256, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.jpeg" alt="Método Acelera!" style={{ height: 100, objectFit: 'contain', objectPosition: 'left', display: 'block', maxWidth: '100%' }} />
          <p style={{ fontSize: 11, color: '#E8FF00', fontWeight: 700, margin: '6px 0 0 0' }}>Super Admin</p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                textDecoration: 'none', transition: 'all 0.15s',
                backgroundColor: isActive ? '#E8FF00' : 'transparent',
                color: isActive ? '#0A0A0A' : 'var(--text-2)',
              })}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                if (!el.classList.contains('active')) { el.style.color = 'var(--text)'; el.style.backgroundColor = 'var(--surface-hover)' }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                if (!el.classList.contains('active')) { el.style.color = 'var(--text-2)'; el.style.backgroundColor = 'transparent' }
              }}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}

          <div style={{ marginTop: 8, height: 1, backgroundColor: 'var(--border)' }} />

          <NavLink
            to="/coach"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', color: 'var(--text-2)', marginTop: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          >
            <ArrowLeft size={18} />
            Painel Coach
          </NavLink>
        </nav>

        {/* User */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
              {user?.name?.charAt(0)}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>Super Admin</p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            style={{ ...btnStyle(hoverTheme), marginBottom: 4 }}
            onMouseEnter={() => setHoverTheme(true)}
            onMouseLeave={() => setHoverTheme(false)}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            {isDark ? 'Modo Claro' : 'Modo Escuro'}
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            style={btnStyle(hoverSignout)}
            onMouseEnter={() => setHoverSignout(true)}
            onMouseLeave={() => setHoverSignout(false)}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
