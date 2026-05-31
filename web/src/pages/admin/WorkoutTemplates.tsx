import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, X, Check, Dumbbell, LayoutList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Template {
  id: string
  name: string
  description?: string
  active: boolean
  created_at: string
}

const emptyForm = { name: '', description: '' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }
const spin: React.CSSProperties = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function WorkoutTemplates() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [filtered, setFiltered] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTemplates() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(templates.filter(t =>
      t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    ))
  }, [search, templates])

  const fetchTemplates = async () => {
    const { data } = await supabase.from('workout_templates').select('*').order('name')
    setTemplates(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }

  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({ name: t.name, description: t.description || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null }
      if (editing) {
        await supabase.from('workout_templates').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('workout_templates').insert({ ...payload, created_by: user!.id })
      }
      setShowModal(false)
      fetchTemplates()
    } finally { setSaving(false) }
  }

  const toggleActive = async (t: Template) => {
    await supabase.from('workout_templates').update({ active: !t.active }).eq('id', t.id)
    fetchTemplates()
  }

  const activeCount = templates.filter(t => t.active).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Templates de Treino</h1>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '2px 8px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{activeCount} ativos</span>
            </div>
          </div>
          <button onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}>
            <Plus size={16} /> Novo Template
          </button>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 480 }}>
          <Search size={16} color="#888" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Buscar por nome ou descrição..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 40, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 14 }}
            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div style={spin} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid var(--border)' }}>
                <Dumbbell size={24} color="var(--text-2)" />
              </div>
              <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>
                {search ? 'Nenhum template encontrado.' : 'Nenhum template cadastrado ainda.'}
              </p>
              {!search && <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>Crie templates globais para agilizar a montagem de treinos.</p>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => (
              <TemplateCard key={t.id} template={t} onEdit={() => openEdit(t)} onToggle={() => toggleActive(t)} onBuild={() => navigate(`/admin/templates/${t.id}/build`)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{editing ? 'Editar Template' : 'Novo Template'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Nome *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Hipertrofia 4x por semana"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Descrição</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Descreva a proposta deste template..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: 20, borderTop: '1px solid var(--border)' }}>
              <ModalBtn onClick={() => setShowModal(false)}>Cancelar</ModalBtn>
              <ModalBtn primary onClick={handleSave} disabled={saving || !form.name.trim()} style={{ flex: 2 }}>
                {saving
                  ? <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <><Check size={16} /> {editing ? 'Salvar' : 'Criar Template'}</>}
              </ModalBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TemplateCard({ template: t, onEdit, onToggle, onBuild }: { template: Template; onEdit: () => void; onToggle: () => void; onBuild: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', backgroundColor: hovered ? 'var(--surface-hover)' : 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, opacity: t.active ? 1 : 0.5, transition: 'background-color 0.15s' }}>

      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 14 }}>
        <Dumbbell size={18} color={t.active ? '#E8FF00' : 'var(--text-2)'} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t.name}</p>
        {t.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
        <button onClick={onToggle}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: t.active ? '#E8FF00' : 'var(--text-2)', padding: '5px 8px', borderRadius: 8 }}>
          {t.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {t.active ? 'Ativo' : 'Inativo'}
        </button>
        <button onClick={onBuild}
          title="Montar treino"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: '1px solid #E8FF0033', backgroundColor: '#E8FF0011', color: '#E8FF00', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget.style.backgroundColor = '#E8FF0022') }}
          onMouseLeave={e => { (e.currentTarget.style.backgroundColor = '#E8FF0011') }}>
          <LayoutList size={14} /> Montar
        </button>
        <button onClick={onEdit}
          style={{ padding: 7, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
          <Pencil size={15} />
        </button>
      </div>
    </div>
  )
}

function ModalBtn({ children, onClick, primary, disabled, style: extra }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid var(--border)', backgroundColor: primary ? '#E8FF00' : (hovered ? 'var(--surface-hover)' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)'), opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', ...extra }}>
      {children}
    </button>
  )
}
