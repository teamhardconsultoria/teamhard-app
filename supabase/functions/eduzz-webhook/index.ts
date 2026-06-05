import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAN_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
}

// Eduzz product codes → plan type
const PROD_PLAN: Record<string, string> = {
  '60E2D8AKW3': 'quarterly',
  '40QROXQ39B': 'monthly',
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

serve(async (req) => {
  try {
    // Validate secret token from query param
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const expectedSecret = Deno.env.get('EDUZZ_WEBHOOK_SECRET')
    if (expectedSecret && secret !== expectedSecret) {
      return new Response('unauthorized', { status: 401 })
    }

    // Parse body — Eduzz may send form-encoded or JSON
    let body: Record<string, string>
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      body = Object.fromEntries(new URLSearchParams(text))
    }

    const transId = body.trans_id
    const transStatus = body.trans_status
    const cusEmail = body.cus_email?.toLowerCase?.()
    const prodCod = body.prod_cod
    const transValue = parseFloat(body.trans_value || '0')
    const paymentMethod = body.trans_paymentmethod || ''

    if (!transId || !transStatus) {
      return new Response('ignored', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find user by email
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .ilike('email', cusEmail)
      .maybeSingle()

    if (!userRow) {
      console.log('User not found for email:', cusEmail)
      return new Response('user not found', { status: 200 })
    }

    // Find student associated with that user
    const { data: student } = await supabase
      .from('students')
      .select('id, plan_type, plan_end')
      .eq('user_id', userRow.id)
      .maybeSingle()

    if (!student) {
      console.log('Student not found for user:', userRow.id)
      return new Response('student not found', { status: 200 })
    }

    // Determine plan type from Eduzz product code, fallback to student's current plan
    const planType = PROD_PLAN[prodCod] || student.plan_type

    const methodMap: Record<string, string> = {
      credit_card: 'Crédito', boleto: 'Boleto', pix: 'PIX', debit_card: 'Débito',
    }
    const method = methodMap[paymentMethod.toLowerCase()] || paymentMethod

    // Find or create payment record by Eduzz transaction ID
    let { data: dbPayment } = await supabase
      .from('payments')
      .select('id, student_id, plan_type')
      .eq('eduzz_transaction_id', transId)
      .maybeSingle()

    if (!dbPayment) {
      const today = new Date().toISOString().split('T')[0]
      const { data: inserted } = await supabase.from('payments').insert({
        student_id: student.id,
        eduzz_transaction_id: transId,
        amount: transValue || (planType === 'quarterly' ? 741 : 397),
        status: 'pending',
        payment_method: method,
        due_date: today,
        plan_type: planType,
        source: 'eduzz',
      }).select('id, student_id, plan_type').single()

      if (inserted) dbPayment = inserted
    }

    if (!dbPayment) {
      return new Response('could not create payment', { status: 200 })
    }

    if (transStatus === 'approved' || transStatus === 'approved_manual') {
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).eq('id', dbPayment.id)

      const now = new Date().toISOString().split('T')[0]
      const base = student.plan_end > now ? student.plan_end : now
      const months = PLAN_MONTHS[planType] || 1

      await supabase.from('students').update({
        payment_status: 'active',
        plan_end: addMonths(base, months),
        plan_type: planType,
        access_blocked: false,
      }).eq('id', student.id)
    }

    if (transStatus === 'waiting_payment' || transStatus === 'pending') {
      await supabase.from('payments').update({ status: 'pending' }).eq('id', dbPayment.id)
    }

    if (transStatus === 'cancelled' || transStatus === 'expired' || transStatus === 'refunded' || transStatus === 'chargeback') {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', dbPayment.id)
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
