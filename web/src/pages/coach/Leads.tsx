import { useEffect, useState, useRef } from 'react'
import { Plus, X, Phone, Mail, Calendar, MessageCircle, UserCheck, Pencil, Trash2, Copy, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  status: string
  notes: string | null
  next_contact_at: string | null
  converted_student_id: string | null
  created_at: string
}

const STATUSES = [
  { key: 'new',        label: 'Novo',        color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
  { key: 'contacted',  label: 'Contactado',  color: '#E8FF00', bg: 'rgba(232,255,0,0.10)'  },
  { key: 'interested', label: 'Interessado', color: '#FF9800', bg: 'rgba(255,152,0,0.10)'  },
  { key: 'converted',  label: 'Convertido',  color: '#00C853', bg: 'rgba(0,200,83,0.10)'   },
  { key: 'lost',       label: 'Perdido',     color: '#666',    bg: 'rgba(100,100,100,0.07)'},
]

const SOURCES = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'referral',  label: 'Indicação',  color: '#9C27B0' },
  { key: 'whatsapp',  label: 'WhatsApp',  color: '#25D366' },
  { key: 'website',   label: 'Site',       color: '#3B82F6' },
  { key: 'other',     label: 'Outro',      color: '#888'    },
]

const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]))
const STATUS_MAP  = Object.fromEntries(STATUSES.map(s => [s.key, s]))

const PLAN_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, permuta: 12 }
const PLAN_LABEL:  Record<string, string>  = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', permuta: 'Permuta' }

function calcPlanEnd(start: string, planType: string) {
  const d = new Date(start + 'T12:00:00')
  d.setMonth(d.getMonth() + (PLAN_MONTHS[planType] || 1))
  return d.toISOString().split('T')[0]
}

function isOverdue(date: string | null) {
  if (!date) return false
  return date < new Date().toISOString().split('T')[0]
}

function fmtDate(date: string | null) {
  if (!date) return null
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

const emptyForm = { name: '', phone: '', email: '', source: '', notes: '', next_contact_at: '', status: 'new' }
const PLAN_DEFAULTS: Record<string, number> = { monthly: 299, quarterly: 807, semiannual: 1434 }
const emptyConvert = { plan_type: 'monthly', plan_start: new Date().toISOString().split('T')[0], amount: '299.00', payment_method: 'subscription', installment_count: 1, discount: '0', cpf: '', address: '', cep: '' }

export default function Leads() {
  const { user } = useAuthStore()
  const [leads, setLeads]         = useState<Lead[]>([])
  const [loading, setLoading]     = useState(true)
  const [coachId, setCoachId]     = useState<string | null>(null)

  // Lead modal
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<Lead | null>(null)
  const [form, setForm]             = useState(emptyForm)
  const [saving, setSaving]         = useState(false)
  const [modalError, setModalError] = useState('')

  // Convert modal
  const [converting, setConverting]     = useState<Lead | null>(null)
  const [convertForm, setConvertForm]   = useState(emptyConvert)
  const [convertSaving, setConvertSaving] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [convertedPass, setConvertedPass] = useState('')
  const [copied, setCopied]             = useState(false)
  const [convertedStudentId, setConvertedStudentId] = useState<string | null>(null)
  const [contractSending, setContractSending] = useState(false)
  const [contractLink, setContractLink] = useState('')
  const [contractError, setContractError] = useState('')

  // Delete confirm
  const [deleting, setDeleting] = useState<Lead | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    setCoachId(coach.id)
    await fetchLeads(coach.id)
    setLoading(false)
  }

  async function fetchLeads(cid = coachId) {
    if (!cid) return
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('coach_id', cid)
      .order('created_at', { ascending: false })
    setLeads((data as Lead[]) || [])
  }

  // ── Open add modal
  function openAdd(defaultStatus = 'new') {
    setEditing(null)
    setForm({ ...emptyForm, status: defaultStatus })
    setModalError('')
    setShowModal(true)
  }

  // ── Open edit modal
  function openEdit(lead: Lead) {
    setEditing(lead)
    setForm({
      name:            lead.name,
      phone:           lead.phone || '',
      email:           lead.email || '',
      source:          lead.source || '',
      notes:           lead.notes || '',
      next_contact_at: lead.next_contact_at || '',
      status:          lead.status,
    })
    setModalError('')
    setShowModal(true)
  }

  // ── Save (create or update)
  async function handleSave() {
    if (!form.name.trim()) { setModalError('Nome é obrigatório.'); return }
    setSaving(true); setModalError('')
    const payload: any = {
      name:            form.name.trim(),
      phone:           form.phone.trim() || null,
      email:           form.email.trim() || null,
      source:          form.source || null,
      notes:           form.notes.trim() || null,
      next_contact_at: form.next_contact_at || null,
      status:          form.status,
    }
    if (editing) {
      await supabase.from('leads').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('leads').insert({ ...payload, coach_id: coachId })
    }
    await fetchLeads()
    setSaving(false)
    setShowModal(false)
  }

  // ── Quick status move
  async function moveStatus(lead: Lead, newStatus: string) {
    await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l))
  }

  // ── Delete
  async function handleDelete() {
    if (!deleting) return
    await supabase.from('leads').delete().eq('id', deleting.id)
    setLeads(prev => prev.filter(l => l.id !== deleting.id))
    setDeleting(null)
  }

  // ── Convert to student
  function openConvert(lead: Lead) {
    setConverting(lead)
    setConvertForm(emptyConvert)
    setConvertError('')
    setConvertedPass('')
    setCopied(false)
    setConvertedStudentId(null)
    setContractLink('')
    setContractError('')
  }

  async function handleConvert() {
    if (!converting) return
    setConvertSaving(true); setConvertError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-student', {
        body: {
          name:       converting.name,
          email:      converting.email || '',
          phone:      converting.phone || null,
          plan_type:  convertForm.plan_type,
          plan_start: convertForm.plan_start,
          coach_id:   coachId,
        },
      })
      if (fnErr || data?.error) { setConvertError(data?.error || fnErr?.message || 'Erro ao criar aluno.'); setConvertSaving(false); return }

      if (convertForm.amount && parseFloat(convertForm.amount) > 0 && data.student_id) {
        const totalInst = convertForm.payment_method === 'subscription'
          ? (PLAN_MONTHS[convertForm.plan_type] || 1)
          : convertForm.installment_count
        await supabase.rpc('generate_payment_schedule', {
          p_student_id:        data.student_id,
          p_plan_end:          calcPlanEnd(convertForm.plan_start, convertForm.plan_type),
          p_plan_type:         convertForm.plan_type,
          p_amount_per_inst:   parseFloat(convertForm.amount) / totalInst,
          p_total_installments: totalInst,
        })
      }

      await supabase.from('leads').update({ status: 'converted', converted_student_id: data.student_id }).eq('id', converting.id)
      await fetchLeads()
      setConvertedPass(data.tempPassword)
      setConvertedStudentId(data.student_id || null)
    } catch (e: any) {
      setConvertError(e.message || 'Erro inesperado.')
    } finally {
      setConvertSaving(false)
    }
  }

  async function sendLeadContract() {
    if (!converting) return
    setContractSending(true); setContractError('')
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('send-contract', {
        body: { student_id: convertedStudentId, name: converting.name, email: converting.email, cpf: convertForm.cpf, address: convertForm.address, cep: convertForm.cep },
      })
      if (fnErr || res?.error) { setContractError(res?.error || fnErr?.message || 'Erro ao enviar contrato.'); return }
      if (res?.link) {
        setContractLink(res.link)
      } else if (res?.pdf_base64) {
        const bytes = Uint8Array.from(atob(res.pdf_base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'contrato_team_hard.pdf'; a.click()
        URL.revokeObjectURL(url)
        setContractLink('downloaded')
      }
    } catch (e: any) {
      setContractError(e.message || 'Erro inesperado.')
    } finally {
      setContractSending(false)
    }
  }

  function copyConvertPass() {
    if (!converting || !convertedPass) return
    navigator.clipboard.writeText(
      `Olá ${converting.name}! Seu acesso ao Team Hard:\nE-mail: ${converting.email}\nSenha provisória: ${convertedPass}\nBaixe o app e faça login.`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const byStatus = (key: string) => leads.filter(l => l.status === key)
  const total = leads.length

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '28px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>CRM / Leads</h1>
            <span style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 9px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              {total}
            </span>
          </div>
          <button
            onClick={() => openAdd()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 16px', borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4e800')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E8FF00')}
          >
            <Plus size={16} /> Novo Lead
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '0 28px 28px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {STATUSES.map(status => {
          const cols = byStatus(status.key)
          return (
            <div key={status.key} style={{ flexShrink: 0, width: 270, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '10px 12px', backgroundColor: status.bg, borderRadius: 10, border: `1px solid ${status.color}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: status.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: status.color }}>{status.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: status.color, opacity: 0.7, backgroundColor: `${status.color}22`, borderRadius: 8, padding: '1px 7px' }}>{cols.length}</span>
                </div>
                <button
                  onClick={() => openAdd(status.key)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: status.color, opacity: 0.7, padding: 2, display: 'flex', alignItems: 'center' }}
                  title={`Adicionar lead em ${status.label}`}
                >
                  <Plus size={15} />
                </button>
              </div>

              {/* Cards */}
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {cols.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    statusColor={status.color}
                    onEdit={() => openEdit(lead)}
                    onDelete={() => setDeleting(lead)}
                    onConvert={() => openConvert(lead)}
                    onMove={newStatus => moveStatus(lead, newStatus)}
                  />
                ))}
                {cols.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: 13 }}>
                    Nenhum lead
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal Add/Edit ── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              {editing ? 'Editar Lead' : 'Novo Lead'}
            </h2>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome *">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome do lead" style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Telefone / WhatsApp">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999" style={inputStyle} />
              </Field>
              <Field label="E-mail">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com" style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Origem">
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={inputStyle}>
                  <option value="">Selecionar...</option>
                  {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Próximo contato">
              <input type="date" value={form.next_contact_at} onChange={e => setForm(f => ({ ...f, next_contact_at: e.target.value }))} style={inputStyle} />
            </Field>

            <Field label="Anotações">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observações sobre o lead..." rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            {modalError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{modalError}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowModal(false)} style={{ ...btnSecondary }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar Lead'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Converter em Aluno ── */}
      {converting && (
        <Modal onClose={() => { setConverting(null); setConvertedPass('') }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Converter em Aluno</h2>
            <button onClick={() => { setConverting(null); setConvertedPass('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {convertedPass ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: 'rgba(0,200,83,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <UserCheck size={26} color="#00C853" />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{converting.name} virou aluno!</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>Senha provisória gerada com sucesso.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                <button onClick={copyConvertPass}
                  style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>
                  {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar dados de acesso</>}
                </button>
                {contractLink === 'downloaded' ? (
                  <div style={{ backgroundColor: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontSize: 13, color: '#00C853', fontWeight: 700, margin: 0 }}>Contrato baixado com sucesso!</p>
                  </div>
                ) : contractLink ? (
                  <div style={{ backgroundColor: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ fontSize: 13, color: '#00C853', fontWeight: 700, margin: 0 }}>Contrato enviado para assinatura!</p>
                    <a href={contractLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>Ver link do contrato</a>
                  </div>
                ) : (
                  <button onClick={sendLeadContract} disabled={contractSending}
                    style={{ ...btnPrimary, backgroundColor: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 auto', opacity: contractSending ? 0.7 : 1 }}>
                    {contractSending
                      ? <div style={{ width: 14, height: 14, border: '2px solid #888', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      : 'Enviar Contrato para Assinatura'}
                  </button>
                )}
                {contractError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0, textAlign: 'center' }}>{contractError}</p>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ backgroundColor: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 4px' }}>Lead</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{converting.name}</p>
                {converting.email && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0' }}>{converting.email}</p>}
              </div>

              {!converting.email && (
                <p style={{ color: '#FF9800', fontSize: 13, margin: 0 }}>
                  Atenção: este lead não tem e-mail cadastrado. Adicione um e-mail antes de converter.
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="CPF">
                  <input value={convertForm.cpf} onChange={e => setConvertForm(f => ({ ...f, cpf: e.target.value }))}
                    placeholder="000.000.000-00" style={inputStyle} />
                </Field>
                <Field label="CEP">
                  <input value={convertForm.cep} onChange={e => setConvertForm(f => ({ ...f, cep: e.target.value }))}
                    placeholder="00000-000" style={inputStyle} />
                </Field>
              </div>

              <Field label="Endereço">
                <input value={convertForm.address} onChange={e => setConvertForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Rua, número, bairro, cidade/UF" style={inputStyle} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Plano">
                  <select value={convertForm.plan_type} onChange={e => {
                    const pt = e.target.value
                    const base = PLAN_DEFAULTS[pt]
                    const amt = base != null ? base.toFixed(2) : ''
                    setConvertForm(f => ({ ...f, plan_type: pt, amount: amt, discount: '0', installment_count: 1 }))
                  }} style={inputStyle}>
                    {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Início do plano">
                  <input type="date" value={convertForm.plan_start} onChange={e => setConvertForm(f => ({ ...f, plan_start: e.target.value }))} style={inputStyle} />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Desconto (%)">
                  <input type="number" min="0" max="100" step="1" placeholder="0"
                    value={convertForm.discount}
                    onChange={e => {
                      const d = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                      const base = PLAN_DEFAULTS[convertForm.plan_type]
                      const finalAmt = base != null ? (base * (1 - d / 100)).toFixed(2) : convertForm.amount
                      setConvertForm(f => ({ ...f, discount: e.target.value, amount: finalAmt }))
                    }} style={inputStyle} />
                </Field>
                <Field label="Valor total (R$)">
                  <div style={{ padding: '10px 12px', backgroundColor: 'rgba(232,255,0,0.06)', border: '1px solid rgba(232,255,0,0.2)', borderRadius: 9, color: '#E8FF00', fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>
                    {parseFloat(convertForm.amount || '0') > 0
                      ? `R$ ${parseFloat(convertForm.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </div>
                </Field>
              </div>

              <Field label="Forma de pagamento">
                <select value={convertForm.payment_method} onChange={e => setConvertForm(f => ({ ...f, payment_method: e.target.value }))} style={inputStyle}>
                  <option value="subscription">Assinatura mensal</option>
                  <option value="pix">PIX / boleto (à vista)</option>
                  <option value="credit">Cartão parcelado</option>
                </select>
              </Field>

              {convertForm.payment_method === 'credit' && (
                <Field label="Parcelas">
                  <select value={convertForm.installment_count} onChange={e => setConvertForm(f => ({ ...f, installment_count: Number(e.target.value) }))} style={inputStyle}>
                    {Array.from({ length: PLAN_MONTHS[convertForm.plan_type] || 1 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x de R$ {(parseFloat(convertForm.amount || '0') / n).toFixed(2)}</option>
                    ))}
                  </select>
                </Field>
              )}

              {convertError && <p style={{ color: '#FF4444', fontSize: 13, margin: 0 }}>{convertError}</p>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setConverting(null)} style={btnSecondary}>Cancelar</button>
                <button onClick={handleConvert} disabled={convertSaving || !converting.email}
                  style={{ ...btnPrimary, opacity: (convertSaving || !converting.email) ? 0.5 : 1 }}>
                  {convertSaving ? 'Criando...' : 'Converter em Aluno'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Modal Deletar ── */}
      {deleting && (
        <Modal onClose={() => setDeleting(null)}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Remover lead</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>
            Tem certeza que quer remover <strong style={{ color: 'var(--text)' }}>{deleting.name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setDeleting(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={handleDelete} style={{ ...btnPrimary, backgroundColor: '#FF4444' }}>Remover</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, statusColor, onEdit, onDelete, onConvert, onMove }: {
  lead: Lead
  statusColor: string
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  onMove: (s: string) => void
}) {
  const [showMove, setShowMove] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMove) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowMove(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showMove])

  const src = lead.source ? SOURCE_MAP[lead.source] : null
  const overdue = isOverdue(lead.next_contact_at)
  const waPhone = lead.phone ? `https://wa.me/55${lead.phone.replace(/\D/g, '')}` : null
  const isConverted = lead.status === 'converted'

  return (
    <div style={{
      backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 14, borderLeft: `3px solid ${statusColor}`,
    }}>
      {/* Name + source */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>{lead.name}</p>
        {src && (
          <span style={{ fontSize: 10, fontWeight: 700, color: src.color, backgroundColor: `${src.color}18`, borderRadius: 6, padding: '2px 7px', flexShrink: 0, border: `1px solid ${src.color}30` }}>
            {src.label}
          </span>
        )}
      </div>

      {/* Contact info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
        {lead.phone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <Phone size={11} /> {lead.phone}
          </span>
        )}
        {lead.email && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Mail size={11} /> {lead.email}
          </span>
        )}
        {lead.next_contact_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: overdue ? '#FF4444' : 'var(--text-2)', fontWeight: overdue ? 700 : 400 }}>
            <Calendar size={11} /> {overdue ? '⚠ ' : ''}{fmtDate(lead.next_contact_at)}
          </span>
        )}
      </div>

      {/* Notes */}
      {lead.notes && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {lead.notes}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {waPhone && (
          <a href={waPhone} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#25D366', backgroundColor: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 7, padding: '4px 9px', textDecoration: 'none' }}>
            <MessageCircle size={12} /> WhatsApp
          </a>
        )}

        {!isConverted && (
          <button onClick={onConvert}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#00C853', backgroundColor: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>
            <UserCheck size={12} /> Converter
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {/* Move status */}
          <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setShowMove(v => !v)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              Mover ▾
            </button>
            {showMove && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.25)', zIndex: 50, overflow: 'hidden', minWidth: 140 }}>
                {STATUSES.filter(s => s.key !== lead.status).map(s => (
                  <button key={s.key} onClick={() => { onMove(s.key); setShowMove(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={onEdit}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
            <Pencil size={13} />
          </button>
          <button onClick={onDelete}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: '#FF4444', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)',
  backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  backgroundColor: '#E8FF00', color: '#0A0A0A', fontWeight: 700, padding: '10px 20px',
  borderRadius: 10, fontSize: 14, border: 'none', cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  backgroundColor: 'transparent', color: 'var(--text-2)', fontWeight: 600, padding: '10px 20px',
  borderRadius: 10, fontSize: 14, border: '1px solid var(--border)', cursor: 'pointer',
}
