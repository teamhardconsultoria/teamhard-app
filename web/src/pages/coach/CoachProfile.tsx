import { useEffect, useRef, useState } from 'react'
import { Camera, Save, Lock, Eye, EyeOff, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

export default function CoachProfile() {
  const { user, initAuth } = useAuthStore()

  // Dados pessoais
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Dados profissionais
  const [bio, setBio] = useState('')
  const [cpf, setCpf] = useState('')
  const [cref, setCref] = useState('')
  const [address, setAddress] = useState('')

  // Senha
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Estados de UI
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const [{ data: u }, { data: c }] = await Promise.all([
      supabase.from('users').select('name, phone, avatar_url').eq('id', user!.id).single(),
      supabase.from('coaches').select('bio, cpf, cref_cbmf, address').eq('user_id', user!.id).single(),
    ])
    if (u) { setName(u.name ?? ''); setPhone(u.phone ?? ''); setAvatarUrl(u.avatar_url) }
    if (c) { setBio(c.bio ?? ''); setCpf(c.cpf ?? ''); setCref(c.cref_cbmf ?? ''); setAddress(c.address ?? '') }
    setLoading(false)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user!.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user!.id)
    setAvatarUrl(publicUrl)
    setUploadingAvatar(false)
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) { setProfileMsg({ type: 'err', text: 'Nome é obrigatório.' }); return }
    setSavingProfile(true)
    setProfileMsg(null)
    const [uRes, cRes] = await Promise.all([
      supabase.from('users').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', user!.id),
      supabase.from('coaches').update({
        bio: bio.trim() || null,
        cpf: cpf.trim() || null,
        cref_cbmf: cref.trim() || null,
        address: address.trim() || null,
      }).eq('user_id', user!.id),
    ])
    if (uRes.error || cRes.error) {
      setProfileMsg({ type: 'err', text: 'Erro ao salvar. Tente novamente.' })
    } else {
      setProfileMsg({ type: 'ok', text: 'Perfil atualizado com sucesso!' })
      initAuth()
    }
    setSavingProfile(false)
  }

  const handleSavePassword = async () => {
    if (newPassword.length < 6) { setPasswordMsg({ type: 'err', text: 'A senha deve ter no mínimo 6 caracteres.' }); return }
    if (newPassword !== confirmPassword) { setPasswordMsg({ type: 'err', text: 'As senhas não coincidem.' }); return }
    setSavingPassword(true)
    setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordMsg({ type: 'err', text: error.message || 'Erro ao atualizar senha.' })
    } else {
      setPasswordMsg({ type: 'ok', text: 'Senha atualizada com sucesso!' })
      setNewPassword(''); setConfirmPassword('')
    }
    setSavingPassword(false)
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 32px' }}>Meu Perfil</h1>

        {/* ── Seção: Informações ──────────────────────────── */}
        <Section icon={<User size={16} color="#E8FF00" />} title="Informações">

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            <div
              style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => fileInputRef.current?.click()}
              title="Alterar foto"
            >
              <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--border)' }}>
                {uploadingAvatar ? (
                  <div style={{ width: 24, height: 24, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 30, fontWeight: 900, color: '#0A0A0A' }}>{name.charAt(0) || user?.name?.charAt(0)}</span>
                )}
              </div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', backgroundColor: 'var(--surface)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={13} color="var(--text-2)" />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{name || user?.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>{user?.email}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 12, color: '#E8FF00', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              >
                Alterar foto
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row>
              <Field label="Nome completo *">
                <Input value={name} onChange={setName} placeholder="Seu nome" />
              </Field>
              <Field label="WhatsApp">
                <Input value={phone} onChange={setPhone} placeholder="+55 11 99999-9999" type="tel" />
              </Field>
            </Row>
            <Field label="E-mail">
              <Input value={user?.email ?? ''} onChange={() => {}} placeholder="" disabled />
            </Field>
            <Field label="Bio profissional">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Apresentação profissional exibida para os alunos..."
                rows={3}
                style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </Field>
            <Row>
              <Field label="CREF / CBMF">
                <Input value={cref} onChange={setCref} placeholder="000000-G/SP" />
              </Field>
              <Field label="CPF">
                <Input value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
              </Field>
            </Row>
            <Field label="Endereço">
              <Input value={address} onChange={setAddress} placeholder="Rua, número, cidade..." />
            </Field>
          </div>

          {profileMsg && (
            <p style={{ fontSize: 13, margin: '14px 0 0', color: profileMsg.type === 'ok' ? '#22c55e' : '#ef4444' }}>
              {profileMsg.text}
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn loading={savingProfile} onClick={handleSaveProfile} />
          </div>
        </Section>

        {/* ── Seção: Segurança ─────────────────────────────── */}
        <Section icon={<Lock size={16} color="#E8FF00" />} title="Segurança">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nova senha">
              <PasswordInput value={newPassword} onChange={setNewPassword} show={showNew} onToggle={() => setShowNew(v => !v)} placeholder="Mínimo 6 caracteres" />
            </Field>
            <Field label="Confirmar nova senha">
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm(v => !v)} placeholder="Repita a nova senha" />
            </Field>
          </div>

          {passwordMsg && (
            <p style={{ fontSize: 13, margin: '14px 0 0', color: passwordMsg.type === 'ok' ? '#22c55e' : '#ef4444' }}>
              {passwordMsg.text}
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn loading={savingPassword} onClick={handleSavePassword} label="Atualizar senha" />
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon}{title}
      </h2>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 14 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ width: '100%', padding: '12px 14px', backgroundColor: disabled ? 'rgba(255,255,255,0.03)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: disabled ? 'var(--text-2)' : 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', cursor: disabled ? 'default' : 'text' }}
      onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = '#E8FF00' }}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )
}

function PasswordInput({ value, onChange, show, onToggle, placeholder }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '12px 44px 12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
      <button
        type="button"
        onClick={onToggle}
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function SaveBtn({ loading, onClick, label = 'Salvar alterações' }: { loading: boolean; onClick: () => void; label?: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: hovered && !loading ? '#d4e800' : '#E8FF00', color: '#0A0A0A', opacity: loading ? 0.7 : 1, transition: 'background-color 0.15s' }}
    >
      {loading
        ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        : <Save size={15} />}
      {label}
    </button>
  )
}
