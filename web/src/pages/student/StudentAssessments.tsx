import { useEffect, useState } from 'react'
import { Camera, Plus, X, ChevronDown, Scale } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Assessment {
  id: string
  weight: number
  height?: number
  body_fat_pct?: number
  notes?: string
  created_at: string
  photos: { id: string; angle: string; photo_url: string }[]
}

type PhotoAngle = 'front' | 'back' | 'left' | 'right'
const PHOTO_ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: 'front', label: 'Frente' },
  { key: 'back', label: 'Costas' },
  { key: 'left', label: 'Esquerda' },
  { key: 'right', label: 'Direita' },
]
const ANGLE: Record<string, string> = { front: 'Frente', back: 'Costas', left: 'Esquerda', right: 'Direita' }

const spin = { width: 28, height: 28, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function StudentAssessments() {
  const { user } = useAuthStore()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ weight: '', body_fat_pct: '', notes: '' })
  const [photos, setPhotos] = useState<Record<PhotoAngle, File | null>>({ front: null, back: null, left: null, right: null })
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students').select('id, coach_id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)
    setCoachId(student.coach_id)

    const { data } = await supabase.from('assessments')
      .select('id, weight, height, body_fat_pct, notes, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })

    const withPhotos = await Promise.all((data || []).map(async (a: any) => {
      const { data: ph } = await supabase.from('assessment_photos').select('id, angle, photo_url').eq('assessment_id', a.id)
      return { ...a, photos: ph || [] }
    }))
    setAssessments(withPhotos)
    setLoading(false)
  }

  const openForm = () => {
    setForm({ weight: '', body_fat_pct: '', notes: '' })
    setPhotos({ front: null, back: null, left: null, right: null })
    setPreviews({})
    setError('')
    setShowForm(true)
  }

  const closeForm = () => {
    Object.values(previews).forEach(url => url && URL.revokeObjectURL(url))
    setPreviews({})
    setPhotos({ front: null, back: null, left: null, right: null })
    setShowForm(false)
    setSaving(false)
  }

  const setPhoto = (angle: PhotoAngle, file: File | null) => {
    if (previews[angle]) URL.revokeObjectURL(previews[angle])
    setPhotos(p => ({ ...p, [angle]: file }))
    setPreviews(p => ({ ...p, [angle]: file ? URL.createObjectURL(file) : '' }))
  }

  const submit = async () => {
    if (!form.weight) { setError('Informe seu peso.'); return }
    if (!studentId || !coachId) return
    setSaving(true); setError('')

    const { data: assessment, error: insErr } = await supabase.from('assessments').insert({
      student_id: studentId,
      coach_id: coachId,
      weight: parseFloat(form.weight),
      body_fat_pct: form.body_fat_pct ? parseFloat(form.body_fat_pct) : null,
      notes: form.notes || null,
      read_by_coach: false,
    }).select('id').single()

    if (insErr || !assessment) { setError(insErr?.message || 'Erro ao salvar.'); setSaving(false); return }

    for (const { key } of PHOTO_ANGLES) {
      const file = photos[key]
      if (!file) continue
      const path = `assessments/${studentId}/${assessment.id}/${key}.jpg`
      const { error: upErr } = await supabase.storage.from('assessment-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) continue
      const { data: { publicUrl } } = supabase.storage.from('assessment-photos').getPublicUrl(path)
      await supabase.from('assessment_photos').insert({ assessment_id: assessment.id, angle: key, photo_url: publicUrl })
    }

    closeForm()
    load()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: '20px 16px 48px', maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Avaliações</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>
              {assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''} registrada{assessments.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={openForm}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, backgroundColor: '#E8FF00', border: 'none', color: '#0A0A0A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Nova avaliação
          </button>
        </div>

        {assessments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Scale size={24} color="#888" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Nenhuma avaliação ainda</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>Envie sua primeira avaliação para o coach</p>
            <button onClick={openForm}
              style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, backgroundColor: '#E8FF00', border: 'none', color: '#0A0A0A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> Enviar avaliação
            </button>
          </div>
        ) : assessments.map((a, idx) => (
          <AssessmentCard key={a.id} assessment={a} index={assessments.length - idx} formatDate={fmt} />
        ))}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'max(24px,env(safe-area-inset-bottom,24px))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Nova avaliação</p>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Peso (kg) *">
                  <input type="number" value={form.weight} placeholder="Ex: 72.5" step="0.1" min="30" max="300"
                    onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </FormField>
                <FormField label="% Gordura (opcional)">
                  <input type="number" value={form.body_fat_pct} placeholder="Ex: 18.5" step="0.1" min="1" max="60"
                    onChange={e => setForm(p => ({ ...p, body_fat_pct: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </FormField>
              </div>
              <FormField label="Observações (opcional)">
                <textarea value={form.notes} placeholder="Como você está se sentindo? Alguma observação para o coach?" rows={3}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={focusStyle} onBlur={blurStyle} />
              </FormField>
              <FormField label="Fotos (opcional)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PHOTO_ANGLES.map(({ key, label }) => {
                    const preview = previews[key]
                    return (
                      <label key={key} style={{ cursor: 'pointer', display: 'block' }}>
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => setPhoto(key, e.target.files?.[0] ?? null)} />
                        <div style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg)', border: `1px solid ${preview ? 'rgba(232,255,0,0.4)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {preview
                            ? <img src={preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <><Camera size={16} color="#555" /><p style={{ fontSize: 9, color: '#555', margin: '4px 0 0', textAlign: 'center' }}>{label}</p></>}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: '2px 0', textAlign: 'center' }}>
                            <span style={{ fontSize: 9, color: '#ccc' }}>{label}</span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </FormField>
              {error && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeForm}
                  style={{ flex: 1, padding: '12px 0', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={submit} disabled={saving}
                  style={{ flex: 2, padding: '12px 0', backgroundColor: saving ? 'var(--border)' : '#E8FF00', color: saving ? 'var(--text-2)' : '#0A0A0A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Enviando…' : 'Enviar avaliação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssessmentCard({ assessment, index, formatDate }: {
  assessment: Assessment; index: number; formatDate: (s: string) => string
}) {
  const [open, setOpen] = useState(index === 1)

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Avaliação #{index}</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '3px 0 0 0' }}>{formatDate(assessment.created_at)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{assessment.weight} kg</p>
            {assessment.body_fat_pct != null && (
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{assessment.body_fat_pct}% gordura</p>
            )}
          </div>
          <ChevronDown size={16} color="#888" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </div>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {assessment.notes && (
            <div style={{ marginTop: 14, backgroundColor: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>Observações</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{assessment.notes}</p>
            </div>
          )}
          {assessment.photos.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0' }}>Fotos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {assessment.photos.map(photo => (
                  <div key={photo.id} style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <img src={photo.photo_url} alt={ANGLE[photo.angle]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 0', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, color: '#fff' }}>{ANGLE[photo.angle]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!assessment.notes && assessment.photos.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 14, margin: '14px 0 0' }}>Sem fotos ou observações.</p>
          )}
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const focusStyle = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = '#E8FF00' }
const blurStyle = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }
