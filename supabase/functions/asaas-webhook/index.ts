import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAN_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
}
const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12,
}
// Todas as assinaturas agora usam ciclo MONTHLY independente do plano

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

serve(async (req) => {
  try {
    const body = await req.json()
    const event = body.event as string
    const payment = body.payment

    if (!event || !payment?.id) {
      return new Response('ignored', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Tenta encontrar pagamento avulso existente
    let { data: dbPayment } = await supabase
      .from('payments')
      .select('id, student_id, plan_type')
      .eq('asaas_charge_id', payment.id)
      .maybeSingle()

    // Se não encontrou, verifica se vem de uma assinatura recorrente
    if (!dbPayment && payment.subscription) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, student_id, billing_type, cycle, amount')
        .eq('asaas_subscription_id', payment.subscription)
        .maybeSingle()

      if (sub) {
        const method =
          sub.billing_type === 'CREDIT_CARD' ? 'Crédito recorrente'
          : sub.billing_type === 'PIX' ? 'PIX'
          : 'Boleto'

        const { data: studentData } = await supabase
          .from('students').select('plan_type').eq('id', sub.student_id).single()
        const planType = studentData?.plan_type || 'monthly'

        const { data: inserted } = await supabase.from('payments').insert({
          student_id: sub.student_id,
          asaas_charge_id: payment.id,
          amount: sub.amount,
          status: 'pending',
          payment_method: method,
          due_date: payment.dueDate || new Date().toISOString().split('T')[0],
          plan_type: planType,
          pix_qr_code: payment.pixQrCode?.encodedImage || null,
          pix_payload: payment.pixQrCode?.payload || null,
          bank_slip_url: payment.bankSlipUrl || null,
          invoice_url: payment.invoiceUrl || null,
        }).select('id, student_id').single()

        if (inserted) dbPayment = { id: inserted.id, student_id: inserted.student_id, plan_type: planType }
      }
    }

    if (!dbPayment) {
      return new Response('payment not found', { status: 200 })
    }

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).eq('id', dbPayment.id)

      const { data: student } = await supabase
        .from('students')
        .select('plan_end, plan_type')
        .eq('id', dbPayment.student_id)
        .single()

      if (student) {
        // Descobre quantos meses renovar: assinatura tem prioridade sobre plan_type
        let months = PLAN_MONTHS[dbPayment.plan_type] || 1
        if (payment.subscription) {
          const { data: sub } = await supabase.from('subscriptions').select('cycle').eq('asaas_subscription_id', payment.subscription).maybeSingle()
          if (sub?.cycle) months = CYCLE_MONTHS[sub.cycle] || months
        }

        const now = new Date().toISOString().split('T')[0]
        const base = student.plan_end > now ? student.plan_end : now
        await supabase.from('students').update({
          payment_status: 'active',
          plan_end: addMonths(base, months),
          access_blocked: false,
        }).eq('id', dbPayment.student_id)
      }
    }

    if (event === 'PAYMENT_OVERDUE') {
      await supabase.from('payments').update({ status: 'overdue' }).eq('id', dbPayment.id)
      await supabase.from('students').update({ payment_status: 'overdue' }).eq('id', dbPayment.student_id)
    }

    if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', dbPayment.id)
    }

    if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
      if (payment.subscription) {
        await supabase.from('subscriptions').update({ status: 'inactive' }).eq('asaas_subscription_id', payment.subscription)
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
