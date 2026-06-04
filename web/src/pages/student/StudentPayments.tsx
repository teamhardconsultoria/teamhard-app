import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Payment {
  id: string; amount: number; status: string; payment_method?: string
  due_date: string; paid_at?: string; plan_type: string
  installment_number?: number; total_installments?: number
}

const STATUS_COLOR: Record<string, string> = { paid: '#22c55e', pending: '#FF9800', overdue: '#FF4444' }
const STATUS_LABEL: Record<string, string> = { paid: 'Pago', pending: 'Pendente', overdue: 'Vencido' }
const STATUS_ICON: Record<string, React.ReactNode> = {
  paid: <CheckCircle size={14} />,
  pending: <Clock size={14} />,
  overdue: <AlertCircle size={14} />,
}
const PLAN_LABEL: Record<string, string> = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', permuta: 'Permuta' }
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
const fmtMoney = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const spin = { width: 28, height: 28, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function StudentPayments() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [planStatus, setPlanStatus] = useState<string | null>(null)
  const [planEnd, setPlanEnd] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase.from('students')
      .select('id, payment_status, plan_end').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setPlanStatus(student.payment_status)
    setPlanEnd(student.plan_end)
    const { data } = await supabase.from('payments')
      .select('id, amount, status, payment_method, due_date, paid_at, plan_type, installment_number, total_installments')
      .eq('student_id', student.id)
      .order('due_date', { ascending: false })
    setPayments(data || [])
    setLoading(false)
  }

  const pad = isMobile ? '20px 16px 48px' : '40px 32px 48px'

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={spin} />
    </div>
  )

  const statusColor = planStatus === 'active' ? '#22c55e' : planStatus === 'overdue' ? '#FF4444' : '#FF9800'
  const statusLabel = planStatus === 'active' ? 'Em dia' : planStatus === 'overdue' ? 'Vencido' : planStatus === 'pending' ? 'Pendente' : (planStatus || '—')

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg)' }}>
      <div style={{ padding: pad, maxWidth: 640 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>Pagamentos</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Histórico de cobranças do seu plano</p>
        </div>

        {/* Status card */}
        {planStatus && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${statusColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CreditCard size={20} color={statusColor} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 2px' }}>Status do plano</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: statusColor, margin: 0 }}>{statusLabel}</p>
            </div>
            {planEnd && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 2px' }}>Vencimento</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{fmt(planEnd)}</p>
              </div>
            )}
          </div>
        )}

        {/* Payment list */}
        {payments.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
            <CreditCard size={40} color="var(--border)" />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Nenhum registro</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Sem histórico de pagamentos ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payments.map(p => {
              const color = STATUS_COLOR[p.status] || 'var(--text-2)'
              const label = STATUS_LABEL[p.status] || p.status
              const icon = STATUS_ICON[p.status] || null
              return (
                <div key={p.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>
                      {fmtMoney(p.amount)}
                      {p.total_installments && p.total_installments > 1
                        ? <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 12, marginLeft: 6 }}>({p.installment_number}/{p.total_installments})</span>
                        : null}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                      {PLAN_LABEL[p.plan_type] || p.plan_type}
                      {p.payment_method ? ` · ${p.payment_method}` : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color, backgroundColor: `${color}14`, borderRadius: 6, padding: '3px 8px', marginBottom: 4 }}>
                      {icon}{label}
                    </span>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                      {p.paid_at ? `Pago ${fmt(p.paid_at)}` : `Vence ${fmt(p.due_date)}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
