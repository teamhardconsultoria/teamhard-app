import { useEffect, useState } from 'react'
import { Plus, Search, Youtube, Pencil, ToggleLeft, ToggleRight, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Exercise {
  id: string; name: string; muscle_groups: string[]
  youtube_url?: string; instructions?: string; equipment?: string
  active: boolean; created_at: string
}

const MUSCLE_GROUPS = ['Peito','Costas','Ombros','Bíceps','Tríceps','Antebraço','Abdômen','Quadríceps','Posterior de coxa','Glúteos','Panturrilha','Trapézio','Full Body']
const EQUIPMENT_OPTIONS = ['Barra','Halteres','Máquina','Cabo','Anilha','Elástico','Peso corporal','Kettlebell','Smith']
const emptyForm = { name:'', muscle_groups:[] as string[], youtube_url:'', instructions:'', equipment:'' }

const inputStyle: React.CSSProperties = { width:'100%', padding:'12px 14px', backgroundColor:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:14, outline:'none', boxSizing:'border-box' }
const labelStyle: React.CSSProperties = { fontSize:11, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:1 }
const spin: React.CSSProperties = { width:32, height:32, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

export default function ExerciseLibrary() {
  const { user } = useAuthStore()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [filtered, setFiltered] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchExercises() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(exercises.filter(e => e.name.toLowerCase().includes(q) || e.muscle_groups.some(m => m.toLowerCase().includes(q))))
  }, [search, exercises])

  const fetchExercises = async () => {
    const { data } = await supabase.from('exercises').select('*').order('name')
    setExercises(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }

  const openEdit = (ex: Exercise) => {
    setEditing(ex)
    setForm({ name:ex.name, muscle_groups:ex.muscle_groups, youtube_url:ex.youtube_url || '', instructions:ex.instructions || '', equipment:ex.equipment || '' })
    setShowModal(true)
  }

  const toggleMuscle = (m: string) => setForm(prev => ({
    ...prev, muscle_groups: prev.muscle_groups.includes(m) ? prev.muscle_groups.filter(x => x !== m) : [...prev.muscle_groups, m],
  }))

  const handleSave = async () => {
    if (!form.name.trim() || form.muscle_groups.length === 0) return
    setSaving(true)
    try {
      const payload = { name:form.name.trim(), muscle_groups:form.muscle_groups, youtube_url:form.youtube_url || null, instructions:form.instructions || null, equipment:form.equipment || null }
      if (editing) await supabase.from('exercises').update(payload).eq('id', editing.id)
      else await supabase.from('exercises').insert({ ...payload, created_by: user!.id })
      setShowModal(false)
      fetchExercises()
    } finally { setSaving(false) }
  }

  const toggleActive = async (ex: Exercise) => {
    await supabase.from('exercises').update({ active: !ex.active }).eq('id', ex.id)
    fetchExercises()
  }

  const activeCount = exercises.filter(e => e.active).length

  return (
    <div style={{ flex:1, overflowY:'auto', backgroundColor:'var(--bg)' }}>
      <div style={{ padding:32, paddingTop:40, paddingBottom:48 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <h1 style={{ fontSize:22, fontWeight:900, color:'var(--text)', margin:0 }}>Biblioteca de Exercícios</h1>
            <div style={{ backgroundColor:'var(--surface)', borderRadius:12, border:'1px solid var(--border)', padding:'2px 8px' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text-2)' }}>{activeCount} ativos</span>
            </div>
          </div>
          <button onClick={openNew}
            style={{ display:'flex', alignItems:'center', gap:8, backgroundColor:'#E8FF00', color:'#0A0A0A', fontWeight:700, padding:'10px 16px', borderRadius:10, fontSize:14, border:'none', cursor:'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}>
            <Plus size={16} /> Novo Exercício
          </button>
        </div>

        {/* Busca */}
        <div style={{ position:'relative', marginBottom:20, maxWidth:480 }}>
          <Search size={16} color="#888" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
          <input type="text" placeholder="Buscar por nome ou músculo..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft:40, backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, fontSize:14 }}
            onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
        </div>

        {/* Lista de cards */}
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}><div style={spin} /></div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign:'center', color:'var(--text-2)', fontSize:14, paddingTop:60 }}>
            {search ? 'Nenhum exercício encontrado.' : 'Nenhum exercício cadastrado ainda.'}
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map(ex => (
              <ExerciseCard key={ex.id} exercise={ex} onEdit={() => openEdit(ex)} onToggle={() => toggleActive(ex)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
          <div style={{ backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, width:'100%', maxWidth:520, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <h2 style={{ fontSize:18, fontWeight:900, color:'var(--text)', margin:0 }}>{editing ? 'Editar Exercício' : 'Novo Exercício'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', padding:4 }}><X size={20} /></button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:18 }}>
              {/* Nome */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={labelStyle}>Nome *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} placeholder="Ex: Supino Reto com Barra" style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              </div>

              {/* Grupos musculares */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <label style={labelStyle}>Grupos Musculares *</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {MUSCLE_GROUPS.map(m => (
                    <ChipBtn key={m} label={m} active={form.muscle_groups.includes(m)} onClick={() => toggleMuscle(m)} />
                  ))}
                </div>
              </div>

              {/* Equipamento */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <label style={labelStyle}>Equipamento</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {EQUIPMENT_OPTIONS.map(eq => (
                    <ChipBtn key={eq} label={eq} active={form.equipment === eq} onClick={() => setForm(p => ({ ...p, equipment: p.equipment === eq ? '' : eq }))} />
                  ))}
                </div>
              </div>

              {/* YouTube */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={labelStyle}>URL do Vídeo (YouTube)</label>
                <input type="url" value={form.youtube_url} onChange={e => setForm(p => ({ ...p, youtube_url:e.target.value }))} placeholder="https://youtube.com/watch?v=..." style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              </div>

              {/* Instruções */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={labelStyle}>Instruções de Execução</label>
                <textarea value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions:e.target.value }))} placeholder="Descreva a execução correta..." rows={3}
                  style={{ ...inputStyle, resize:'none', fontFamily:'inherit' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, padding:20, borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <ModalBtn onClick={() => setShowModal(false)}>Cancelar</ModalBtn>
              <ModalBtn primary onClick={handleSave} disabled={saving || !form.name.trim() || form.muscle_groups.length === 0} style={{ flex:2 }}>
                {saving
                  ? <div style={{ width:16, height:16, border:'2px solid #0A0A0A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                  : <><Check size={16} /> {editing ? 'Salvar' : 'Criar Exercício'}</>}
              </ModalBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({ exercise: ex, onEdit, onToggle }: { exercise:Exercise; onEdit:()=>void; onToggle:()=>void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', backgroundColor: hovered ? 'var(--surface-hover)' : 'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:14, opacity: ex.active ? 1 : 0.5, transition:'background-color 0.15s' }}>

      {/* Info principal */}
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>{ex.name}</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:6 }}>
          {ex.muscle_groups.map(m => (
            <span key={m} style={{ fontSize:11, backgroundColor:'var(--surface)', color:'var(--text-2)', padding:'2px 8px', borderRadius:20 }}>{m}</span>
          ))}
          {ex.equipment && (
            <span style={{ fontSize:11, backgroundColor:'rgba(232,255,0,0.08)', color:'#E8FF00', padding:'2px 8px', borderRadius:20, border:'1px solid rgba(232,255,0,0.2)' }}>{ex.equipment}</span>
          )}
        </div>
      </div>

      {/* Ações */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:12 }}>
        {ex.youtube_url && (
          <a href={ex.youtube_url} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#FF4444', textDecoration:'none', padding:'5px 10px', borderRadius:8, border:'1px solid rgba(255,68,68,0.2)', backgroundColor:'rgba(255,68,68,0.05)' }}>
            <Youtube size={13} /> Ver
          </a>
        )}
        <button onClick={onToggle}
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, background:'none', border:'none', cursor:'pointer', color: ex.active ? '#E8FF00' : 'var(--text-2)', padding:'5px 8px', borderRadius:8 }}>
          {ex.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {ex.active ? 'Ativo' : 'Inativo'}
        </button>
        <button onClick={onEdit}
          style={{ padding:7, color:'var(--text-2)', background:'none', border:'none', cursor:'pointer', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
          <Pencil size={15} />
        </button>
      </div>
    </div>
  )
}

function ChipBtn({ label, active, onClick }: { label:string; active:boolean; onClick:()=>void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ fontSize:12, padding:'6px 12px', borderRadius:20, fontWeight:500, cursor:'pointer', transition:'all 0.15s', border: active ? 'none' : '1px solid var(--border)', backgroundColor: active ? '#E8FF00' : (hovered ? 'var(--surface)' : 'transparent'), color: active ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)') }}>
      {label}
    </button>
  )
}

function ModalBtn({ children, onClick, primary, disabled, style: extra }: { children:React.ReactNode; onClick?:()=>void; primary?:boolean; disabled?:boolean; style?:React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px 16px', borderRadius:12, fontSize:14, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid var(--border)', backgroundColor: primary ? '#E8FF00' : (hovered ? 'var(--surface-hover)' : 'transparent'), color: primary ? '#0A0A0A' : (hovered ? 'var(--text)' : 'var(--text-2)'), opacity: disabled ? 0.5 : 1, transition:'all 0.15s', ...extra }}>
      {children}
    </button>
  )
}
