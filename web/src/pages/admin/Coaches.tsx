import { useEffect, useState } from 'react'
import { Plus, Search, Users, Copy, Check, X, UserCheck, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Coach {
  id: string
  cpf?: string
  cref_cbmf?: string
  address?: string
  user: { id: string; name: string; email: string; phone?: string }
  studentCount: number
}

interface Student {
  id: string
  coach_id: string
  user: { id: string; name: string; email: string }
}

const emptyForm = { name: '', cpf: '', cref_cbmf: '', email: '', phone: '', address: '' }

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }
const spin: React.CSSProperties = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function Coaches() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filtered, setFiltered] = useState<Coach[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [managingCoach, setManagingCoach] = useState<Coach | null>(null)
  const [deletingCoach, setDeletingCoach] = useState<Coach | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchCoaches() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(coaches.filter(c =>
      c.user.name.toLowerCase().includes(q) ||
      c.user.email.toLowerCase().includes(q) ||
      (c.cref_cbmf || '').toLowerCase().includes(q)
    ))
  }, [search, coaches])

  const fetchCoaches = async () => {
    const { data, error } = await supabase
      .from('coaches')
      .select('id, cpf, cref_cbmf, address, user:users!user_id(id, name, email, phone)')
      .order('created_at', { ascending: false })

    if (error) { console.error('fetchCoaches error:', error.message); setLoading(false); return }
    if (!data) { setLoading(false); return }

    const withCounts: Coach[] = await Promise.all(data.map(async (c: any) => {
      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', c.id)
      return { ...c, user: c.user, studentCount: count || 0 }
    }))

    setCoaches(withCounts)
    setFiltered(withCounts)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.cpf.trim() || !form.cref_cbmf.trim() || !form.phone.trim() || !form.address.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-coach', {
        body: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          cpf: form.cpf.trim(),
          cref_cbmf: form.cref_cbmf.trim(),
          address: form.address.trim(),
        },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) msg = body.error
        } catch {}
        alert(`Erro: ${msg}`)
        return
      }
      if (data?.error) {
        alert(`Erro: ${data.error}`)
        return
      }
      setTempPassword(data.temp_password)
      fetchCoaches()
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = () => {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(emptyForm)
    setTempPassword(null)
    setCopied(false)
  }

  const openDelete = (coach: Coach) => {
    setDeleteError('')
    setDeletingCoach(coach)
  }

  const handleDelete = async () => {
    if (!deletingCoach) return
    setDeleteLoading(true)
    setDeleteError('')
    const { data, error } = await supabase.functions.invoke('delete-coach', {
      body: { coach_user_id: deletingCoach.user.id },
    })
    if (error) {
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch {}
      setDeleteError(msg)
      setDeleteLoading(false)
      return
    }
    if (data?.error) {
      setDeleteError(data.error)
      setDeleteLoading(false)
      return
    }
    setDeleteLoading(false)
    setDeletingCoach(null)
    fetchCoaches()
  }

  const field = (label: string, key: keyof typeof emptyForm, opts?: { placeholder?: string; type?: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={opts?.type || 'text'}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={opts?.placeholder || ''}
        style={inputStyle}
        onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Coaches</h1>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '2px 8px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{coaches.length} cadastrado{coaches.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}>
            <Plus size={16} /> Novo Coach
          </button>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 480 }}>
          <Search size={16} color="#888" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Buscar por nome, e-mail ou CREF/CBMF..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 40, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}
            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div style={spin} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Users size={22} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>
              {search ? 'Nenhum coach encontrado.' : 'Nenhum coach cadastrado ainda.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(coach => (
              <CoachCard key={coach.id} coach={coach} onManage={() => setManagingCoach(coach)} onDelete={() => openDelete(coach)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal Novo Coach */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Novo Coach</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>

            {tempPassword ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,200,83,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Check size={24} color="#00C853" />
                </div>
                <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: '0 0 8px' }}>Coach criado!</p>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 28px' }}>Envie a senha temporária ao coach. Ele deverá alterá-la no primeiro acesso.</p>
                <div style={{ width: '100%', padding: 20, backgroundColor: 'var(--bg)', border: '1px solid rgba(232,255,0,0.3)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 6px' }}>Senha temporária</p>
                    <p style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: 900, color: 'var(--accent-text)', letterSpacing: 4, margin: 0 }}>{tempPassword}</p>
                  </div>
                  <button onClick={copyPassword} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#00C853' : '#888', flexShrink: 0, padding: 4 }}>
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                  </button>
                </div>
                <button onClick={closeModal}
                  style={{ width: '100%', padding: '14px', backgroundColor: '#E8FF00', border: 'none', borderRadius: 12, color: '#0A0A0A', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                  Concluir
                </button>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Dados Pessoais</p>
                  {field('Nome Completo *', 'name', { placeholder: 'Ex: João da Silva' })}
                  {field('CPF *', 'cpf', { placeholder: '000.000.000-00' })}
                  {field('CBMF / CREF *', 'cref_cbmf', { placeholder: 'Ex: 12345 ou 123456-G/SP' })}
                  <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
                  <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Contato e Acesso</p>
                  {field('E-mail *', 'email', { placeholder: 'coach@email.com', type: 'email' })}
                  {field('Telefone *', 'phone', { placeholder: '(11) 99999-9999' })}
                  <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
                  <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Endereço</p>
                  {field('Endereço Completo *', 'address', { placeholder: 'Rua, número, bairro, cidade — UF' })}
                </div>
                <div style={{ display: 'flex', gap: 10, padding: 20, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                  <ModalBtn onClick={closeModal}>Cancelar</ModalBtn>
                  <ModalBtn primary onClick={handleCreate} disabled={saving || !form.name.trim() || !form.email.trim() || !form.cpf.trim() || !form.cref_cbmf.trim() || !form.phone.trim() || !form.address.trim()} style={{ flex: 2 }}>
                    {saving
                      ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      : <><Plus size={16} /> Criar Coach</>}
                  </ModalBtn>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Excluir Coach */}
      {deletingCoach && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={16} color="#ef4444" />
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Excluir Coach</h2>
              </div>
              <button onClick={() => setDeletingCoach(null)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Info do coach */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, backgroundColor: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
                  {deletingCoach.user.name.charAt(0)}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{deletingCoach.user.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>{deletingCoach.user.email}</p>
                </div>
              </div>

              {deletingCoach.studentCount > 0 ? (
                /* Bloqueio: coach tem alunos */
                <div style={{ display: 'flex', gap: 10, backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                  <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                    Este coach tem <strong>{deletingCoach.studentCount} aluno{deletingCoach.studentCount !== 1 ? 's' : ''}</strong>. Migre-os para outro treinador antes de excluir.
                  </p>
                </div>
              ) : (
                /* Confirmação */
                <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                  Tem certeza? O coach, sua conta de acesso e todos os dados associados serão <strong style={{ color: 'var(--text)' }}>removidos permanentemente</strong>.
                </p>
              )}

              {deleteError && (
                <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{deleteError}</p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <ModalBtn onClick={() => setDeletingCoach(null)}>Cancelar</ModalBtn>
                {deletingCoach.studentCount === 0 && (
                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: 'none', cursor: deleteLoading ? 'not-allowed' : 'pointer', backgroundColor: '#ef4444', color: '#fff', opacity: deleteLoading ? 0.6 : 1, transition: 'opacity 0.15s' }}
                  >
                    {deleteLoading
                      ? <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      : <><Trash2 size={15} /> Excluir permanentemente</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Alunos */}
      {managingCoach && (
        <ManageStudentsModal
          coach={managingCoach}
          allCoaches={coaches}
          onClose={() => { setManagingCoach(null); fetchCoaches() }}
        />
      )}
    </div>
  )
}

function ManageStudentsModal({ coach, allCoaches, onClose }: { coach: Coach; allCoaches: Coach[]; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => { fetchStudents() }, [])

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, coach_id, user:users!students_user_id_fkey(id, name, email)')
      .order('created_at', { ascending: false })
    setStudents((data as any) || [])
    setLoading(false)
  }

  const assign = async (studentId: string) => {
    setAssigning(studentId)
    await supabase.from('students').update({ coach_id: coach.id }).eq('id', studentId)
    await fetchStudents()
    setAssigning(null)
  }

  const q = search.toLowerCase()
  const matches = (s: Student) =>
    s.user.name.toLowerCase().includes(q) || s.user.email.toLowerCase().includes(q)

  const mine = students.filter(s => s.coach_id === coach.id && matches(s))
  const others = students.filter(s => s.coach_id !== coach.id && matches(s))

  const coachName = (coachId: string) =>
    allCoaches.find(c => c.id === coachId)?.user.name || 'Outro coach'

  const inputStyleLocal: React.CSSProperties = { width: '100%', padding: '10px 12px 10px 36px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Alunos</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0' }}>{coach.user.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#888" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Buscar aluno por nome ou e-mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={inputStyleLocal}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{ width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

            {/* Atribuídos */}
            <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
              Atribuídos a este coach ({mine.length})
            </p>
            {mine.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px' }}>Nenhum aluno atribuído.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {mine.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: 'rgba(232,255,0,0.05)', border: '1px solid rgba(232,255,0,0.15)', borderRadius: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
                      {s.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{s.user.email}</p>
                    </div>
                    <Check size={16} color="#E8FF00" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: 1, backgroundColor: 'var(--border)', marginBottom: 20 }} />

            {/* Outros alunos */}
            <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
              Outros alunos ({others.length})
            </p>
            {others.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum outro aluno disponível.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {others.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-2)', flexShrink: 0 }}>
                      {s.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{s.user.email}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>Coach atual: {coachName(s.coach_id)}</p>
                    </div>
                    <button
                      onClick={() => assign(s.id)}
                      disabled={assigning === s.id}
                      style={{ padding: '6px 14px', backgroundColor: assigning === s.id ? '#1E1E1E' : '#E8FF00', border: 'none', borderRadius: 8, color: assigning === s.id ? 'var(--text-2)' : '#0A0A0A', fontSize: 12, fontWeight: 700, cursor: assigning === s.id ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
                      {assigning === s.id ? '...' : 'Atribuir'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ width: '100%', padding: '13px', backgroundColor: '#E8FF00', border: 'none', borderRadius: 12, color: '#0A0A0A', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}

function CoachCard({ coach, onManage, onDelete }: { coach: Coach; onManage: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', backgroundColor: hovered ? '#161616' : 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, transition: 'background-color 0.15s', gap: 14 }}>

      {/* Avatar */}
      <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, fontWeight: 900, color: '#0A0A0A' }}>
        {coach.user.name.charAt(0)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{coach.user.name}</p>
          {coach.cref_cbmf && (
            <span style={{ fontSize: 11, color: 'var(--accent-text)', backgroundColor: 'rgba(232,255,0,0.08)', border: '1px solid rgba(232,255,0,0.2)', padding: '2px 8px', borderRadius: 20 }}>
              {coach.cref_cbmf}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{coach.user.email}</p>
        {coach.user.phone && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0 0' }}>{coach.user.phone}</p>}
      </div>

      {/* Stats + Ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ textAlign: 'right', marginRight: 4 }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{coach.studentCount}</p>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '2px 0 0 0' }}>aluno{coach.studentCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onManage}
          title="Gerenciar alunos"
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'transparent', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', transition: 'all 0.15s', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E8FF00'; (e.currentTarget as HTMLElement).style.color = '#E8FF00'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(232,255,0,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}>
          <UserCheck size={16} />
        </button>
        <button
          onClick={onDelete}
          title="Excluir coach"
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'transparent', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', transition: 'all 0.15s', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function ModalBtn({ children, onClick, primary, disabled, style: extra }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid var(--border)', backgroundColor: primary ? '#E8FF00' : (hovered ? '#161616' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : '#888'), opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', ...extra }}>
      {children}
    </button>
  )
}
