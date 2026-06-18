import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Step = 'loading' | 'invalid' | 'form' | 'success'

export default function RegisterPage() {
  const { token } = useParams<{ token: string }>()
  const [step, setStep] = useState<Step>('loading')
  const [tokenError, setTokenError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setStep('invalid'); setTokenError('Link inválido.'); return }

    supabase.functions.invoke('register-via-invite', {
      body: { action: 'validate', token },
    }).then(({ data }) => {
      if (!data?.valid) {
        setStep('invalid')
        setTokenError(data?.error || 'Link inválido.')
      } else {
        if (data.email) setEmail(data.email)
        setStep('form')
      }
    }).catch(() => {
      setStep('invalid')
      setTokenError('Não foi possível validar o link.')
    })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return }

    setSaving(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('register-via-invite', {
        body: { action: 'register', token, name: name.trim(), email: email.trim().toLowerCase(), password, phone: phone.trim() || null },
      })

      if (fnError) { setError('Erro ao criar conta. Tente novamente.'); return }
      if (data?.error) { setError(data.error); return }

      setStep('success')
    } catch {
      setError('Erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', fontSize: 14, borderRadius: 12,
    border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 2,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <img src="/logo.jpeg" alt="Team Hard" style={{ width: 160, height: 160, objectFit: 'contain', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-2)', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', margin: 0 }}>
            Consultoria Esportiva
          </p>
        </div>

        {step === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>Validando link...</p>
          </div>
        )}

        {step === 'invalid' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ backgroundColor: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 14, padding: '20px 24px' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#FF4444', margin: '0 0 6px' }}>Link inválido</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{tokenError}</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Peça ao seu coach um novo link de convite.
            </p>
            <Link to="/login" style={{ color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Ir para o login
            </Link>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>Criar sua conta</h1>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Preencha seus dados para começar.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Nome completo *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome completo"
                required
                autoComplete="name"
                className="focus:border-[#E8FF00]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>E-mail *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="focus:border-[#E8FF00]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+55 11 99999-9999"
                autoComplete="tel"
                className="focus:border-[#E8FF00]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Senha *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                autoComplete="new-password"
                className="focus:border-[#E8FF00]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Confirmar senha *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
                autoComplete="new-password"
                className="focus:border-[#E8FF00]"
                style={inputStyle}
              />
            </div>

            {error && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={saving}
              style={{
                width: '100%', backgroundColor: '#E8FF00', color: '#0A0A0A',
                fontWeight: 900, padding: '15px', borderRadius: 12, fontSize: 14,
                letterSpacing: 3, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1, transition: 'opacity 0.2s', marginTop: 4,
              }}
            >
              {saving ? 'CRIANDO CONTA...' : 'CRIAR CONTA'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Já tem conta?{' '}
              <Link to="/login" style={{ color: 'var(--accent-text)', fontWeight: 700, textDecoration: 'none' }}>
                Fazer login
              </Link>
            </p>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.25)', borderRadius: 14, padding: '24px' }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>💪</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: '0 0 6px' }}>Conta criada com sucesso!</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                Seu coach irá definir seu plano em breve. Já pode fazer login e completar seu perfil!
              </p>
            </div>
            <Link
              to="/login"
              style={{
                display: 'block', width: '100%', backgroundColor: '#E8FF00', color: '#0A0A0A',
                fontWeight: 900, padding: '15px', borderRadius: 12, fontSize: 14,
                letterSpacing: 3, textDecoration: 'none', boxSizing: 'border-box',
              }}
            >
              IR PARA O LOGIN
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
