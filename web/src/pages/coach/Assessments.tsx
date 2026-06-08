import { useEffect, useRef, useState } from 'react'
import { Scale, ChevronDown, ChevronLeft, ChevronRight, X, ImageOff, SlidersHorizontal, ClipboardPlus, Camera, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Student { id: string; name: string; email: string; hasUnread?: boolean }
interface AssessmentPhoto { id: string; angle: string; photo_url: string }
interface Assessment {
  id: string; weight: number; height: number; body_fat_pct?: number
  notes?: string; read_by_coach: boolean; created_at: string; photos: AssessmentPhoto[]
}

const ANGLE: Record<string, string> = { front: 'Frente', back: 'Costas', left: 'Esquerda', right: 'Direita' }
const ANGLE_ORDER = ['front', 'back', 'left', 'right']
const spin = { width: 24, height: 24, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

interface ManualForm { date: string; weight: string; height: string; body_fat_pct: string; notes: string }
type PhotoAngle = 'front' | 'back' | 'left' | 'right'
const PHOTO_ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: 'front', label: 'Frente' }, { key: 'back', label: 'Costas' },
  { key: 'left', label: 'Esquerda' }, { key: 'right', label: 'Direita' },
]

export default function Assessments() {
  const { user } = useAuthStore()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingAssessments, setLoadingAssessments] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: AssessmentPhoto[]; index: number } | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState<ManualForm>({ date: '', weight: '', height: '', body_fat_pct: '', notes: '' })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualPhotos, setManualPhotos] = useState<Record<PhotoAngle, File | null>>({ front: null, back: null, left: null, right: null })
  const [manualPreviews, setManualPreviews] = useState<Record<string, string>>({})

  const [editAssessment, setEditAssessment] = useState<Assessment | null>(null)
  const [editForm, setEditForm] = useState({ weight: '', height: '', body_fat_pct: '', notes: '' })
  const [editPhotos, setEditPhotos] = useState<Record<PhotoAngle, File | null>>({ front: null, back: null, left: null, right: null })
  const [editPreviews, setEditPreviews] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoadingStudents(false); return }
    setCoachId(coach.id)
    const { data } = await supabase.from('students').select('id, user:users(name, email)').eq('coach_id', coach.id).order('created_at', { ascending: false })
    const studentList = (data || []).map((s: any) => ({ id: s.id, name: s.user.name, email: s.user.email }))

    const ids = studentList.map(s => s.id)
    const { data: unread } = ids.length
      ? await supabase.from('assessments').select('student_id').eq('read_by_coach', false).in('student_id', ids)
      : { data: [] }
    const unreadSet = new Set((unread || []).map((a: any) => a.student_id))

    setStudents(studentList.map(s => ({ ...s, hasUnread: unreadSet.has(s.id) })))
    setLoadingStudents(false)
  }

  const selectStudent = async (student: Student) => {
    setSelected(student); setAssessments([]); setLoadingAssessments(true); setShowCompare(false)
    const { data } = await supabase.from('assessments').select('id, weight, height, body_fat_pct, notes, read_by_coach, created_at').eq('student_id', student.id).order('created_at', { ascending: false })
    const withPhotos = await Promise.all((data || []).map(async (a: any) => {
      const { data: photos } = await supabase.from('assessment_photos').select('id, angle, photo_url').eq('assessment_id', a.id)
      return { ...a, photos: photos || [] }
    }))
    setAssessments(withPhotos)
    setLoadingAssessments(false)
    if (data && data.some((a: any) => !a.read_by_coach)) {
      await supabase.from('assessments').update({ read_by_coach: true }).eq('student_id', student.id).eq('read_by_coach', false)
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, hasUnread: false } : s))
    }
  }

  const moveLightbox = (dir: number) => {
    if (!lightbox) return
    setLightbox({ ...lightbox, index: (lightbox.index + dir + lightbox.photos.length) % lightbox.photos.length })
  }

  const openManual = () => {
    setManualForm({ date: new Date().toISOString().split('T')[0], weight: '', height: '', body_fat_pct: '', notes: '' })
    setManualPhotos({ front: null, back: null, left: null, right: null })
    setManualPreviews({})
    setManualError('')
    setShowManual(true)
  }

  const closeManual = () => {
    Object.values(manualPreviews).forEach(url => url && URL.revokeObjectURL(url))
    setManualPreviews({})
    setManualPhotos({ front: null, back: null, left: null, right: null })
    setShowManual(false)
    setManualSaving(false)
  }

  const setPhoto = (angle: PhotoAngle, file: File | null) => {
    if (manualPreviews[angle]) URL.revokeObjectURL(manualPreviews[angle])
    setManualPhotos(p => ({ ...p, [angle]: file }))
    setManualPreviews(p => ({ ...p, [angle]: file ? URL.createObjectURL(file) : '' }))
  }

  const openEdit = (a: Assessment) => {
    setEditAssessment(a)
    setEditForm({ weight: String(a.weight), height: String(a.height), body_fat_pct: a.body_fat_pct != null ? String(a.body_fat_pct) : '', notes: a.notes || '' })
    setEditPhotos({ front: null, back: null, left: null, right: null })
    setEditPreviews({})
    setEditError('')
  }

  const closeEdit = () => {
    Object.values(editPreviews).forEach(url => url && URL.revokeObjectURL(url))
    setEditPreviews({})
    setEditPhotos({ front: null, back: null, left: null, right: null })
    setEditAssessment(null)
    setEditSaving(false)
  }

  const setEditPhoto = (angle: PhotoAngle, file: File | null) => {
    if (editPreviews[angle]) URL.revokeObjectURL(editPreviews[angle])
    setEditPhotos(p => ({ ...p, [angle]: file }))
    setEditPreviews(p => ({ ...p, [angle]: file ? URL.createObjectURL(file) : '' }))
  }

  const saveEdit = async () => {
    if (!editAssessment || !editForm.weight) { setEditError('Peso é obrigatório.'); return }
    setEditSaving(true); setEditError('')
    const { error } = await supabase.from('assessments').update({
      weight: parseFloat(editForm.weight),
      height: editForm.height ? parseFloat(editForm.height) : null,
      body_fat_pct: editForm.body_fat_pct ? parseFloat(editForm.body_fat_pct) : null,
      notes: editForm.notes || null,
    }).eq('id', editAssessment.id)
    if (error) { setEditError(error.message); setEditSaving(false); return }

    for (const { key } of PHOTO_ANGLES) {
      const file = editPhotos[key]
      if (!file) continue
      const path = `assessments/${selected!.id}/${editAssessment.id}/${key}.jpg`
      const { error: upErr } = await supabase.storage.from('assessment-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) continue
      const { data: { publicUrl } } = supabase.storage.from('assessment-photos').getPublicUrl(path)
      const existing = editAssessment.photos.find(p => p.angle === key)
      if (existing) {
        await supabase.from('assessment_photos').update({ photo_url: publicUrl }).eq('id', existing.id)
      } else {
        await supabase.from('assessment_photos').insert({ assessment_id: editAssessment.id, angle: key, photo_url: publicUrl })
      }
    }

    closeEdit()
    if (selected) selectStudent(selected)
  }

  const saveManual = async () => {
    if (!selected || !manualForm.date || !manualForm.weight) { setManualError('Data e peso são obrigatórios.'); return }
    setManualSaving(true)
    setManualError('')
    const { data: assessment, error } = await supabase.from('assessments').insert({
      student_id: selected.id,
      coach_id: coachId,
      weight: parseFloat(manualForm.weight),
      height: manualForm.height ? parseFloat(manualForm.height) : null,
      body_fat_pct: manualForm.body_fat_pct ? parseFloat(manualForm.body_fat_pct) : null,
      notes: manualForm.notes || null,
      read_by_coach: true,
      created_at: manualForm.date + 'T12:00:00',
    }).select('id').single()
    if (error) { setManualError(error.message); setManualSaving(false); return }

    for (const { key } of PHOTO_ANGLES) {
      const file = manualPhotos[key]
      if (!file) continue
      const path = `assessments/${selected.id}/${assessment.id}/${key}.jpg`
      const { error: upErr } = await supabase.storage.from('assessment-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) continue
      const { data: { publicUrl } } = supabase.storage.from('assessment-photos').getPublicUrl(path)
      await supabase.from('assessment_photos').insert({ assessment_id: assessment.id, angle: key, photo_url: publicUrl })
    }

    closeManual()
    selectStudent(selected)
  }

  const imc = (w: number, h: number) => (w / ((h / 100) ** 2)).toFixed(1)
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Avaliações</h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Selecione um aluno</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingStudents ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={spin} /></div>
          ) : students.length === 0 ? (
            <p style={{ color: 'var(--text-2)', fontSize: 14, textAlign: 'center', padding: '40px 16px' }}>Nenhum aluno cadastrado.</p>
          ) : students.map(s => (
            <SidebarRow key={s.id} name={s.name} email={s.email} hasUnread={s.hasUnread} isSelected={selected?.id === s.id} onClick={() => selectStudent(s)} />
          ))}
        </div>
      </div>

      {/* Painel direito */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={selected.name} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{selected.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={openManual}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(232,255,0,0.3)', backgroundColor: 'rgba(232,255,0,0.08)', color: '#E8FF00', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(232,255,0,0.16)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(232,255,0,0.08)' }}
              >
                <ClipboardPlus size={15} />
                Registrar histórico
              </button>
              {assessments.length >= 2 && (
                <button
                  onClick={() => setShowCompare(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                >
                  <SlidersHorizontal size={15} />
                  Comparar
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loadingAssessments ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={spin} /></div>
            ) : assessments.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Empty icon={<Scale size={24} color="#888" />} title="Nenhuma avaliação ainda" sub="O aluno ainda não enviou avaliações pelo app." />
              </div>
            ) : assessments.map((a, idx) => (
              <AssessmentCard key={a.id} assessment={a} index={assessments.length - idx} prev={assessments[idx + 1]}
                formatDate={formatDate} imc={imc} onPhotoClick={(photos, i) => setLightbox({ photos, index: i })}
                onEdit={() => openEdit(a)} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty icon={<Scale size={24} color="#888" />} title="Selecione um aluno" sub="Veja o histórico de avaliações" />
        </div>
      )}

      {/* Modal: registrar avaliação histórica */}
      {showManual && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Registrar avaliação histórica</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{selected?.name}</p>
              </div>
              <button onClick={closeManual} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ManualField label="Data da avaliação *">
                <input type="date" value={manualForm.date} max={new Date().toISOString().split('T')[0]}
                  onChange={e => setManualForm(p => ({ ...p, date: e.target.value }))}
                  style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </ManualField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ManualField label="Peso (kg) *">
                  <input type="number" value={manualForm.weight} placeholder="Ex: 72.5" step="0.1" min="30" max="300"
                    onChange={e => setManualForm(p => ({ ...p, weight: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </ManualField>
                <ManualField label="Altura (cm)">
                  <input type="number" value={manualForm.height} placeholder="Ex: 175" step="1" min="100" max="250"
                    onChange={e => setManualForm(p => ({ ...p, height: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </ManualField>
              </div>
              <ManualField label="% Gordura corporal">
                <input type="number" value={manualForm.body_fat_pct} placeholder="Ex: 18.5" step="0.1" min="1" max="60"
                  onChange={e => setManualForm(p => ({ ...p, body_fat_pct: e.target.value }))}
                  style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </ManualField>
              <ManualField label="Observações">
                <textarea value={manualForm.notes} placeholder="Medidas, notas do coach, contexto…" rows={3}
                  onChange={e => setManualForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={focusStyle} onBlur={blurStyle} />
              </ManualField>
              <ManualField label="Fotos (opcional)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PHOTO_ANGLES.map(({ key, label }) => {
                    const preview = manualPreviews[key]
                    return (
                      <label key={key} style={{ cursor: 'pointer', display: 'block' }}>
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => setPhoto(key, e.target.files?.[0] ?? null)} />
                        <div style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg)', border: `1px solid ${preview ? 'rgba(232,255,0,0.4)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {preview
                            ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <><Camera size={16} color="#555" /><p style={{ fontSize: 9, color: '#555', margin: '4px 0 0', textAlign: 'center' }}>{label}</p></>}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: '2px 0', textAlign: 'center' }}>
                            <span style={{ fontSize: 9, color: '#ccc' }}>{label}</span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </ManualField>
              {manualError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{manualError}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeManual}
                  style={{ flex: 1, padding: '10px 0', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={saveManual} disabled={manualSaving}
                  style={{ flex: 2, padding: '10px 0', backgroundColor: manualSaving ? 'var(--border)' : '#E8FF00', color: manualSaving ? 'var(--text-2)' : '#0A0A0A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: manualSaving ? 'not-allowed' : 'pointer' }}>
                  {manualSaving ? 'Salvando…' : 'Salvar avaliação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar avaliação */}
      {editAssessment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 1 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Editar avaliação</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 0 0' }}>{selected?.name} · {formatDate(editAssessment.created_at)}</p>
              </div>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ManualField label="Peso (kg) *">
                  <input type="number" value={editForm.weight} placeholder="Ex: 72.5" step="0.1" min="30" max="300"
                    onChange={e => setEditForm(p => ({ ...p, weight: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </ManualField>
                <ManualField label="Altura (cm)">
                  <input type="number" value={editForm.height} placeholder="Ex: 175" step="1" min="100" max="250"
                    onChange={e => setEditForm(p => ({ ...p, height: e.target.value }))}
                    style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
                </ManualField>
              </div>
              <ManualField label="% Gordura corporal">
                <input type="number" value={editForm.body_fat_pct} placeholder="Ex: 18.5" step="0.1" min="1" max="60"
                  onChange={e => setEditForm(p => ({ ...p, body_fat_pct: e.target.value }))}
                  style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </ManualField>
              <ManualField label="Observações">
                <textarea value={editForm.notes} placeholder="Medidas, notas do coach, contexto…" rows={3}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={focusStyle} onBlur={blurStyle} />
              </ManualField>
              <ManualField label="Fotos — clique para substituir ou adicionar">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PHOTO_ANGLES.map(({ key, label }) => {
                    const newPreview = editPreviews[key]
                    const existing = editAssessment.photos.find(p => p.angle === key)
                    const src = newPreview || existing?.photo_url || ''
                    return (
                      <label key={key} style={{ cursor: 'pointer', display: 'block', position: 'relative' }}>
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => setEditPhoto(key, e.target.files?.[0] ?? null)} />
                        <div style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg)', border: `1px solid ${newPreview ? 'rgba(232,255,0,0.5)' : existing ? 'rgba(0,200,83,0.35)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {src
                            ? <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <><Camera size={16} color="#555" /><p style={{ fontSize: 9, color: '#555', margin: '4px 0 0', textAlign: 'center' }}>{label}</p></>}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: '2px 0', textAlign: 'center' }}>
                            <span style={{ fontSize: 9, color: newPreview ? '#E8FF00' : existing ? '#00C853' : '#888' }}>
                              {newPreview ? 'Nova' : existing ? '✓' : label}
                            </span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </ManualField>
              {editError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{editError}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeEdit}
                  style={{ flex: 1, padding: '10px 0', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  style={{ flex: 2, padding: '10px 0', backgroundColor: editSaving ? 'var(--border)' : '#E8FF00', color: editSaving ? 'var(--text-2)' : '#0A0A0A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                  {editSaving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLightbox(null)}>
          <button style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }} onClick={() => setLightbox(null)}>
            <X size={28} />
          </button>
          {lightbox.photos.length > 1 && (
            <>
              <button style={{ position: 'absolute', left: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 8 }} onClick={e => { e.stopPropagation(); moveLightbox(-1) }}>
                <ChevronLeft size={32} />
              </button>
              <button style={{ position: 'absolute', right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 8 }} onClick={e => { e.stopPropagation(); moveLightbox(1) }}>
                <ChevronRight size={32} />
              </button>
            </>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
            <img src={lightbox.photos[lightbox.index].photo_url} alt={ANGLE[lightbox.photos[lightbox.index].angle]} style={{ maxHeight: '80vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: 12 }} />
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{ANGLE[lightbox.photos[lightbox.index].angle]} · {lightbox.index + 1}/{lightbox.photos.length}</p>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {showCompare && selected && assessments.length >= 2 && (
        <CompareModal
          assessments={assessments}
          studentName={selected.name}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}

// ─── Compare Modal ──────────────────────────────────────────────

function CompareModal({ assessments, studentName, onClose }: {
  assessments: Assessment[]
  studentName: string
  onClose: () => void
}) {
  // assessments[0] = newest, assessments[last] = oldest
  const [idxA, setIdxA] = useState(assessments.length - 1) // "before" default = oldest
  const [idxB, setIdxB] = useState(0)                       // "after"  default = newest
  const [angle, setAngle] = useState('front')

  const asmtA = assessments[idxA]
  const asmtB = assessments[idxB]

  const anglesInA = new Set(asmtA.photos.map(p => p.angle))
  const anglesInB = new Set(asmtB.photos.map(p => p.angle))
  const commonAngles = ANGLE_ORDER.filter(a => anglesInA.has(a) && anglesInB.has(a))
  const activeAngle = commonAngles.includes(angle) ? angle : (commonAngles[0] ?? '')

  const photoA = asmtA.photos.find(p => p.angle === activeAngle)
  const photoB = asmtB.photos.find(p => p.angle === activeAngle)

  const imc = (w: number, h: number) => (w / ((h / 100) ** 2)).toFixed(1)
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })

  const n = assessments.length
  const options = assessments.map((a, i) => ({ value: i, label: `#${n - i} — ${fmtDate(a.created_at)}` }))

  const diffWeight = asmtB.weight - asmtA.weight
  const diffFat = asmtA.body_fat_pct != null && asmtB.body_fat_pct != null ? asmtB.body_fat_pct - asmtA.body_fat_pct : null
  const diffImc = parseFloat(imc(asmtB.weight, asmtB.height)) - parseFloat(imc(asmtA.weight, asmtA.height))

  const sel = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '8px 12px',
    backgroundColor: '#111', border: '1px solid #333',
    borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none',
    ...extra,
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 60, overflowY: 'auto', display: 'flex' }}
      onClick={onClose}
    >
      <div
        style={{ margin: 'auto', width: '100%', maxWidth: 760, padding: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Comparação de Avaliações</p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '4px 0 0 0' }}>{studentName}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <X size={22} />
          </button>
        </div>

        {/* Controls: Before | Angles | After */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'end', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px 0' }}>Antes</p>
            <select value={idxA} onChange={e => setIdxA(Number(e.target.value))} style={sel()}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Ângulo</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {ANGLE_ORDER.map(a => {
                const avail = commonAngles.includes(a)
                const active = activeAngle === a
                return (
                  <button key={a} disabled={!avail} onClick={() => setAngle(a)}
                    style={{
                      padding: '6px 11px', borderRadius: 7, border: '1px solid', fontSize: 11, fontWeight: 700,
                      cursor: avail ? 'pointer' : 'not-allowed',
                      backgroundColor: active ? '#E8FF00' : 'transparent',
                      borderColor: active ? '#E8FF00' : avail ? '#444' : '#2a2a2a',
                      color: active ? '#0A0A0A' : avail ? '#aaa' : '#444',
                      transition: 'all 0.15s',
                    }}>
                    {ANGLE[a]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px 0' }}>Depois</p>
            <select value={idxB} onChange={e => setIdxB(Number(e.target.value))} style={sel()}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Slider or empty state */}
        {photoA && photoB ? (
          <>
            <CompareSlider photoA={photoA.photo_url} photoB={photoB.photo_url} />

            {/* Metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', marginTop: 16, backgroundColor: '#111', borderRadius: 12, border: '1px solid #2a2a2a', overflow: 'hidden' }}>
              <MetricCol
                label={fmtDate(asmtA.created_at)}
                weight={asmtA.weight} fat={asmtA.body_fat_pct} imc={imc(asmtA.weight, asmtA.height)}
                align="left"
              />
              <div style={{ backgroundColor: '#2a2a2a' }} />
              <MetricCol
                label={fmtDate(asmtB.created_at)}
                weight={asmtB.weight} fat={asmtB.body_fat_pct} imc={imc(asmtB.weight, asmtB.height)}
                align="right"
                diffWeight={diffWeight} diffFat={diffFat} diffImc={diffImc}
              />
            </div>
          </>
        ) : (
          <div style={{ backgroundColor: '#111', borderRadius: 12, padding: '56px 24px', textAlign: 'center', border: '1px solid #2a2a2a' }}>
            <ImageOff size={32} color="#444" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
              {commonAngles.length === 0
                ? 'Nenhum ângulo em comum entre as avaliações selecionadas.'
                : 'Uma ou ambas as avaliações não têm foto para este ângulo.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Slider ─────────────────────────────────────────────────────

function CompareSlider({ photoA, photoB }: { photoA: string; photoB: string }) {
  const [pos, setPos] = useState(50)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePos = (clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)))
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
      updatePos(clientX)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', maxWidth: 420, margin: '0 auto', aspectRatio: '3/4', userSelect: 'none', borderRadius: 14, overflow: 'hidden', cursor: dragging ? 'ew-resize' : 'default', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
    >
      {/* Before (full width, clipped on right) */}
      <img src={photoA} draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      {/* After (full width, clipped on left) */}
      <img src={photoB} draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 0 0 ${pos}%)` }} />

      {/* Labels */}
      <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'none' }}>
        <span style={{ backgroundColor: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, letterSpacing: 0.8 }}>ANTES</span>
      </div>
      <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'none' }}>
        <span style={{ backgroundColor: 'rgba(232,255,0,0.92)', color: '#0A0A0A', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, letterSpacing: 0.8 }}>DEPOIS</span>
      </div>

      {/* Divider line */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, transform: 'translateX(-50%)', width: 2, backgroundColor: '#E8FF00', pointerEvents: 'none', boxShadow: '0 0 10px rgba(232,255,0,0.6)' }} />

      {/* Handle */}
      <div
        style={{ position: 'absolute', top: '50%', left: `${pos}%`, transform: 'translate(-50%, -50%)', width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', boxShadow: '0 2px 16px rgba(0,0,0,0.5)', zIndex: 2 }}
        onMouseDown={e => { e.preventDefault(); setDragging(true) }}
        onTouchStart={e => { e.preventDefault(); setDragging(true) }}
      >
        <ChevronLeft size={12} color="#0A0A0A" />
        <ChevronRight size={12} color="#0A0A0A" />
      </div>
    </div>
  )
}

// ─── Metric columns ──────────────────────────────────────────────

function MetricCol({ label, weight, fat, imc, align, diffWeight, diffFat, diffImc }: {
  label: string; weight: number; fat?: number; imc: string; align: 'left' | 'right'
  diffWeight?: number; diffFat?: number | null; diffImc?: number
}) {
  return (
    <div style={{ padding: '16px 20px', textAlign: align }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 10px 0' }}>{label}</p>
      <MetricRow label="Peso" value={`${weight} kg`} diff={diffWeight} />
      <MetricRow label="IMC" value={imc} diff={diffImc} />
      {fat != null && <MetricRow label="% Gordura" value={`${fat}%`} diff={diffFat} />}
    </div>
  )
}

function MetricRow({ label, value, diff }: { label: string; value: string; diff?: number | null }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 10, color: '#555', margin: '0 0 1px 0' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{value}</span>
        {diff != null && diff !== 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: diff < 0 ? '#00C853' : '#FF4444' }}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </span>
        )}
        {diff === 0 && <span style={{ fontSize: 11, color: '#555' }}>=</span>}
      </div>
    </div>
  )
}

// ─── Existing sub-components ────────────────────────────────────

function AssessmentCard({ assessment, index, prev, formatDate, imc, onPhotoClick, onEdit }: {
  assessment: Assessment; index: number; prev?: Assessment
  formatDate: (s: string) => string; imc: (w: number, h: number) => string
  onPhotoClick: (photos: AssessmentPhoto[], i: number) => void
  onEdit: () => void
}) {
  const [open, setOpen] = useState(index === 1)
  const weightDiff = prev ? assessment.weight - prev.weight : null

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Avaliação #{index}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '3px 0 0 0' }}>{formatDate(assessment.created_at)}</p>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Metric label="Peso" value={`${assessment.weight} kg`} diff={weightDiff} unit="kg" />
            <Metric label="IMC" value={imc(assessment.weight, assessment.height)} />
            {assessment.body_fat_pct != null && <Metric label="% Gord." value={`${assessment.body_fat_pct}%`} />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={e => { e.stopPropagation(); onEdit() }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}>
            <Pencil size={13} />
          </button>
          <ChevronDown size={16} color="#888" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
            <MeasureBox label="Peso" value={`${assessment.weight} kg`} />
            <MeasureBox label="Altura" value={`${assessment.height} cm`} />
            <MeasureBox label="IMC" value={imc(assessment.weight, assessment.height)} />
            {assessment.body_fat_pct != null && <MeasureBox label="% Gordura" value={`${assessment.body_fat_pct}%`} />}
          </div>

          {assessment.notes && (
            <div style={{ marginTop: 16, backgroundColor: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>Observações</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{assessment.notes}</p>
            </div>
          )}

          {assessment.photos.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0' }}>Fotos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {assessment.photos.map((photo, i) => (
                  <button key={photo.id} onClick={() => onPhotoClick(assessment.photos, i)}
                    style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--surface)', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <img src={photo.photo_url} alt={ANGLE[photo.angle]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 0', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text)' }}>{ANGLE[photo.angle]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', marginTop: 16 }}>
              <ImageOff size={14} />
              <span style={{ fontSize: 12 }}>Nenhuma foto enviada.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, diff, unit }: { label: string; value: string; diff?: number | null; unit?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{value}</p>
        {diff != null && diff !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: diff < 0 ? '#00C853' : '#FF4444' }}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}{unit}
          </span>
        )}
      </div>
    </div>
  )
}

function MeasureBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
      <p style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '3px 0 0 0' }}>{value}</p>
    </div>
  )
}

function SidebarRow({ name, email, isSelected, hasUnread, onClick }: { name: string; email: string; isSelected: boolean; hasUnread?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', textAlign: 'left', backgroundColor: isSelected || hovered ? 'var(--surface-hover)' : 'transparent', borderBottom: '1px solid var(--border)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' }}>
      <Avatar name={name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</p>
      </div>
      {hasUnread && (
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF9800', flexShrink: 0 }} />
      )}
    </button>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E8FF00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: size * 0.4, fontWeight: 900, color: '#0A0A0A' }}>
      {name.charAt(0)}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const focusStyle = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = '#E8FF00' }
const blurStyle = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }

function ManualField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{icon}</div>
      <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>{title}</p>
      <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>{sub}</p>
    </div>
  )
}
