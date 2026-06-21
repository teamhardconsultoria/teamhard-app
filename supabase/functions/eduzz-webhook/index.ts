import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAN_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12, legado: 1,
}

const PROD_PLAN: Record<string, string> = {
  '60E2D8AKW3': 'quarterly',
  '40QROXQ39B': 'monthly',
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

// Tenta extrair o e-mail do comprador em múltiplas estruturas possíveis da Eduzz
function extractEmail(data: Record<string, unknown>): string | undefined {
  const candidates = [
    (data as any)?.buyer?.email,
    (data as any)?.student?.email,
    (data as any)?.customer?.email,
    (data as any)?.client?.email,
    (data as any)?.sale?.buyer?.email,
    (data as any)?.sale?.customer?.email,
    (data as any)?.email,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('@')) return c.toLowerCase()
  }
  return undefined
}

// Tenta extrair o código do produto em múltiplas estruturas possíveis
function extractProductCode(data: Record<string, unknown>): string | undefined {
  const candidates = [
    (data as any)?.items?.[0]?.productId,
    (data as any)?.items?.[0]?.product_id,
    (data as any)?.content?.id,
    (data as any)?.product?.id,
    (data as any)?.product_id,
    (data as any)?.sale?.content_id,
  ]
  for (const c of candidates) {
    if (c != null) return String(c)
  }
  return undefined
}

// Tenta extrair o valor pago
function extractAmount(data: Record<string, unknown>): number {
  const candidates = [
    (data as any)?.paid?.value,
    (data as any)?.price?.value,
    (data as any)?.amount,
    (data as any)?.value,
    (data as any)?.financial?.value,
    (data as any)?.sale?.price,
  ]
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return c
    if (typeof c === 'string' && parseFloat(c) > 0) return parseFloat(c)
  }
  return 0
}

// Tenta extrair o método de pagamento
function extractPaymentMethod(data: Record<string, unknown>): string {
  const raw =
    (data as any)?.payment?.method ||
    (data as any)?.paymentMethod ||
    (data as any)?.financial?.payment_method ||
    (data as any)?.payment_method ||
    ''
  const methodMap: Record<string, string> = {
    creditCard: 'Crédito', credit_card: 'Crédito', boleto: 'Boleto', pix: 'PIX', debitCard: 'Débito',
  }
  return methodMap[raw] || raw
}

// Tenta extrair o transaction ID
function extractTransactionId(data: Record<string, unknown>): string | undefined {
  const candidates = [
    (data as any)?.id,
    (data as any)?.transaction?.id,
    (data as any)?.trans_id,
    (data as any)?.invoice_id,
    (data as any)?.sale?.id,
  ]
  for (const c of candidates) {
    if (c != null) return String(c)
  }
  return undefined
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const expectedSecret = Deno.env.get('EDUZZ_WEBHOOK_SECRET')
    if (expectedSecret && secret !== expectedSecret) {
      return new Response('unauthorized', { status: 401 })
    }

    const rawBody = await req.text()
    console.log('[eduzz-webhook] RAW BODY:', rawBody)

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.log('[eduzz-webhook] Body não é JSON válido')
      return new Response('invalid json', { status: 400 })
    }

    const event: string = (body.event as string) || ''
    const data = (body.data || body) as Record<string, unknown>

    console.log('[eduzz-webhook] event:', event)
    console.log('[eduzz-webhook] data keys:', Object.keys(data))

    if (!event) {
      console.log('[eduzz-webhook] Sem campo event, ignorando')
      return new Response('ignored', { status: 200 })
    }

    if (!event.startsWith('myeduzz.invoice_')) {
      console.log('[eduzz-webhook] Evento não é invoice:', event)
      return new Response('ignored', { status: 200 })
    }

    const transId = extractTransactionId(data)
    const cusEmail = extractEmail(data)
    const prodCod = extractProductCode(data)
    const transValue = extractAmount(data)
    const method = extractPaymentMethod(data)

    console.log('[eduzz-webhook] Extraído — transId:', transId, '| email:', cusEmail, '| produto:', prodCod, '| valor:', transValue, '| método:', method)

    if (!transId || !cusEmail) {
      console.log('[eduzz-webhook] transId ou email ausentes — abortando')
      return new Response('missing required fields', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .ilike('email', cusEmail)
      .maybeSingle()

    if (!userRow) {
      console.log('[eduzz-webhook] Usuário não encontrado para e-mail:', cusEmail)
      return new Response('user not found', { status: 200 })
    }

    const { data: student } = await supabase
      .from('students')
      .select('id, plan_type, plan_end')
      .eq('user_id', userRow.id)
      .maybeSingle()

    if (!student) {
      console.log('[eduzz-webhook] Aluno não encontrado para user_id:', userRow.id)
      return new Response('student not found', { status: 200 })
    }

    // Resolve plan_type: pelo código do produto, depois pelo plano atual, depois 'legado' como fallback
    const planType = (prodCod && PROD_PLAN[prodCod]) || student.plan_type || 'legado'
    console.log('[eduzz-webhook] planType resolvido:', planType, '(prodCod:', prodCod, ', student.plan_type:', student.plan_type, ')')

    let { data: dbPayment } = await supabase
      .from('payments')
      .select('id, student_id, plan_type')
      .eq('eduzz_transaction_id', transId)
      .maybeSingle()

    if (!dbPayment) {
      const today = new Date().toISOString().split('T')[0]
      const defaultAmount = planType === 'quarterly' ? 741 : 397
      const { data: inserted } = await supabase.from('payments').insert({
        student_id: student.id,
        eduzz_transaction_id: transId,
        amount: transValue || defaultAmount,
        status: 'pending',
        payment_method: method,
        due_date: today,
        plan_type: planType,
        source: 'eduzz',
      }).select('id, student_id, plan_type').single()

      if (inserted) {
        dbPayment = inserted
        console.log('[eduzz-webhook] Pagamento criado:', inserted.id)
      }
    } else {
      console.log('[eduzz-webhook] Pagamento já existe:', dbPayment.id)
    }

    if (!dbPayment) {
      console.log('[eduzz-webhook] Falha ao criar/encontrar pagamento')
      return new Response('could not create payment', { status: 200 })
    }

    if (event === 'myeduzz.invoice_paid') {
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).eq('id', dbPayment.id)

      const today = new Date().toISOString().split('T')[0]
      const base = (student.plan_end && student.plan_end > today) ? student.plan_end : today
      const months = PLAN_MONTHS[planType] || 1

      await supabase.from('students').update({
        payment_status: 'active',
        plan_end: addMonths(base, months),
        plan_type: planType,
        access_blocked: false,
      }).eq('id', student.id)

      console.log('[eduzz-webhook] Pagamento marcado como pago. plan_end atualizado com +', months, 'meses desde', base)
    }

    if (
      event === 'myeduzz.invoice_canceled' ||
      event === 'myeduzz.invoice_refunded' ||
      event === 'myeduzz.invoice_chargeback'
    ) {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', dbPayment.id)
      console.log('[eduzz-webhook] Pagamento estornado/cancelado:', dbPayment.id)
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('[eduzz-webhook] ERRO INESPERADO:', err)
    return new Response('error', { status: 500 })
  }
})
