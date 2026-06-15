import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface FoodItem {
  id: string
  name: string
  category: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  active: boolean
  created_at: string
}

const CATEGORIES = ['proteína', 'carboidrato', 'gordura', 'fruta', 'legume/verdura', 'laticínio', 'outros']

const CATEGORY_COLORS: Record<string, string> = {
  'proteína': '#4FC3F7',
  'carboidrato': '#FFB74D',
  'gordura': '#F06292',
  'fruta': '#81C784',
  'legume/verdura': '#A5D6A7',
  'laticínio': '#CE93D8',
  'outros': '#90A4AE',
}

const emptyForm = {
  name: '', category: 'proteína',
  calories_per_100g: '' as string | number,
  protein_per_100g: '' as string | number,
  carbs_per_100g: '' as string | number,
  fat_per_100g: '' as string | number,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', backgroundColor: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }
const spin: React.CSSProperties = { width: 32, height: 32, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function FoodLibrary() {
  const { user } = useAuthStore()
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [filtered, setFiltered] = useState<FoodItem[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<FoodItem | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchFoods() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      foods.filter(f =>
        (categoryFilter === 'todos' || f.category === categoryFilter) &&
        (!q || f.name.toLowerCase().includes(q))
      )
    )
  }, [search, categoryFilter, foods])

  const fetchFoods = async () => {
    const { data } = await supabase
      .from('food_library')
      .select('*')
      .order('name')
    setFoods(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowModal(true) }

  const openEdit = (f: FoodItem) => {
    setEditing(f)
    setForm({
      name: f.name, category: f.category,
      calories_per_100g: f.calories_per_100g,
      protein_per_100g: f.protein_per_100g,
      carbs_per_100g: f.carbs_per_100g,
      fat_per_100g: f.fat_per_100g,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.calories_per_100g) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        calories_per_100g: Number(form.calories_per_100g),
        protein_per_100g: Number(form.protein_per_100g) || 0,
        carbs_per_100g: Number(form.carbs_per_100g) || 0,
        fat_per_100g: Number(form.fat_per_100g) || 0,
      }
      if (editing) {
        await supabase.from('food_library').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('food_library').insert({ ...payload, created_by: user!.id })
      }
      setShowModal(false)
      fetchFoods()
    } finally { setSaving(false) }
  }

  const toggleActive = async (f: FoodItem) => {
    await supabase.from('food_library').update({ active: !f.active }).eq('id', f.id)
    fetchFoods()
  }

  const activeCount = foods.filter(f => f.active).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: 32, paddingTop: 40, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', margin: '0 0 6px' }}>Biblioteca de Alimentos</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>
              {activeCount} alimento{activeCount !== 1 ? 's' : ''} ativo{activeCount !== 1 ? 's' : ''} · usados nas substituições dos alunos
            </p>
          </div>
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', backgroundColor: '#E8FF00', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#0A0A0A' }}>
            <Plus size={16} /> Novo Alimento
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
            <input
              type="text"
              placeholder="Buscar alimento..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', paddingRight: 32 }}
          >
            <option value="todos">Todas as categorias</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={spin} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
              {foods.length === 0 ? 'Biblioteca vazia' : 'Nenhum resultado'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              {foods.length === 0 ? 'Adicione o primeiro alimento para começar.' : 'Tente outro termo de busca.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(f => (
              <div key={f.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: f.active ? 1 : 0.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{f.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, backgroundColor: CATEGORY_COLORS[f.category] + '22', color: CATEGORY_COLORS[f.category], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {f.category}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{f.calories_per_100g} kcal</span>
                    {' /100g'}
                    {f.protein_per_100g > 0 && ` · P:${f.protein_per_100g}g`}
                    {f.carbs_per_100g > 0 && ` C:${f.carbs_per_100g}g`}
                    {f.fat_per_100g > 0 && ` G:${f.fat_per_100g}g`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(f)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => toggleActive(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.active ? '#E8FF00' : 'var(--text-2)', padding: 4, display: 'flex', alignItems: 'center' }} title={f.active ? 'Desativar' : 'Ativar'}>
                    {f.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ backgroundColor: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
                {editing ? 'Editar Alimento' : 'Novo Alimento'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p style={labelStyle}>Nome do Alimento *</p>
                <input style={inputStyle} placeholder="ex: Frango grelhado" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              <div>
                <p style={labelStyle}>Categoria</p>
                <select style={inputStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>

              <div style={{ backgroundColor: 'var(--bg)', borderRadius: 10, padding: 16 }}>
                <p style={{ ...labelStyle, marginBottom: 12 }}>Valores por 100g</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { key: 'calories_per_100g', label: 'Calorias (kcal) *' },
                    { key: 'protein_per_100g', label: 'Proteína (g)' },
                    { key: 'carbs_per_100g', label: 'Carboidrato (g)' },
                    { key: 'fat_per_100g', label: 'Gordura (g)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <p style={{ ...labelStyle, marginBottom: 6 }}>{label}</p>
                      <input
                        type="number" min="0" step="0.1"
                        style={inputStyle}
                        value={form[key as keyof typeof form] as string}
                        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.calories_per_100g}
                  style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 14, fontWeight: 900, opacity: saving || !form.name.trim() || !form.calories_per_100g ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
