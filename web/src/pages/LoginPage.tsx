import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn, user } = useAuthStore()
  const navigate = useNavigate()

  if (user) {
    if (user.role === 'student') {
      navigate('/student/home', { replace: true })
      return null
    }
    navigate(user.role === 'super_admin' ? '/admin' : '/coach', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch {
      setError('E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
          <img
            src="/logo.jpeg"
            alt="Método Acelera!"
            style={{ width: 200, height: 200, objectFit: 'contain', marginBottom: 8 }}
          />
          <p style={{ color: 'var(--text-2)', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase' }}>
            Consultoria Esportiva
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 2 }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              className="focus:border-[#E8FF00]"
              style={{
                width: '100%', padding: '14px 16px', fontSize: 14, borderRadius: 12,
                border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 2 }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="focus:border-[#E8FF00]"
              style={{
                width: '100%', padding: '14px 16px', fontSize: 14, borderRadius: 12,
                border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              style={{ fontSize: 13, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Esqueci minha senha
            </button>
          </div>

          {error && (
            <p style={{ color: '#FF4444', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', backgroundColor: '#E8FF00', color: '#0A0A0A',
              fontWeight: 900, padding: '15px', borderRadius: 12, fontSize: 14,
              letterSpacing: 3, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'ENTRANDO...' : 'ENTRAR'}
          </button>
        </form>

        {/* CTA */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 6px' }}>Ainda não é aluno?</p>
          <a
            href="https://metodoacelera.github.io/site"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'block', marginBottom: 4 }}
          >
            Entre já para o Método Acelera!
          </a>
          <a
            href="https://metodoacelera.github.io/site"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}
          >
            metodoacelera.github.io/site
          </a>
        </div>

      </div>
    </div>
  )
}
