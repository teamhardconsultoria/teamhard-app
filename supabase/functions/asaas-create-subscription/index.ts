import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ASAAS_URL = Deno.env.get('ASAAS_ENV') === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3'

const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY')!

const ok = (body: object) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

const err = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

async function asaas(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { _raw: text } }
}

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual',
}

// Número máximo de cobranças mensais por plano (0 = sem limite)
const MAX_PAYMENTS: Record<string, number> = {
  monthly: 0, quarterly: 3, semiannual: 6, annual: 12,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { student_id, amount, due_date, billing_type, cpf } = await req.json()

    if (!student_id || !amount || !due_date || !billing_type) {
      return err('Campos obrigatórios ausentes.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: student } = await supabase
      .from('students')
      .select('id, asaas_customer_id, plan_type, user:users(id, name, email, phone, cpf)')
      .eq('id', student_id)
      .single()

    if (!student) return err('Aluno não encontrado.')

    const user = student.user as any
    const planType: string = student.plan_type || 'monthly'
    const studentCpf = (cpf || user.cpf || '').replace(/\D/g, '')

    if (!studentCpf) return err('CPF do aluno é necessário para criar assinatura no Asaas.')

    if (cpf && !user.cpf) {
      await supabase.from('users').update({ cpf }).eq('id', user.id)
    }

    // Garante customer no Asaas
    let customerId = student.asaas_customer_id
    if (!customerId) {
      const search = await asaas(`/customers?cpfCnpj=${studentCpf}`)
      if (search.data?.length > 0) {
        customerId = search.data[0].id
      } else {
        const created = await asaas('/customers', 'POST', {
          name: user.name, cpfCnpj: studentCpf, email: user.email,
          mobilePhone: (user.phone || '').replace(/\D/g, '') || undefined,
        })
        if (created.errors?.length) return err(`Asaas (cliente): ${created.errors[0]?.description}`)
        if (!created.id) return err(`Resposta inesperada ao criar cliente: ${JSON.stringify(created)}`)
        customerId = created.id
      }
      await supabase.from('students').update({ asaas_customer_id: customerId }).eq('id', student_id)
    }

    const maxPayments = MAX_PAYMENTS[planType] || 0
    const subscriptionPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: billing_type,
      value: parseFloat(amount),
      nextDueDate: due_date,
      cycle: 'MONTHLY',
      description: `Plano ${PLAN_LABEL[planType] || planType} - Team Hard`,
    }
    if (maxPayments > 0) subscriptionPayload.maxPayments = maxPayments

    const subscription = await asaas('/subscriptions', 'POST', subscriptionPayload)

    if (subscription.errors?.length) {
      return err(`Asaas (assinatura): ${subscription.errors[0]?.description || JSON.stringify(subscription.errors)}`)
    }
    if (!subscription.id) return err(`Resposta inesperada ao criar assinatura: ${JSON.stringify(subscription)}`)

    const { error: insertErr } = await supabase.from('subscriptions').insert({
      student_id,
      asaas_subscription_id: subscription.id,
      billing_type,
      cycle: 'MONTHLY',
      amount: parseFloat(amount),
      next_due_date: due_date,
      status: 'active',
      payment_link: subscription.paymentLink || null,
    })

    if (insertErr) return err(`Erro ao salvar assinatura: ${insertErr.message}`)

    await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: user.id,
        title: '💳 Assinatura criada',
        body: `Sua assinatura ${PLAN_LABEL[planType] || planType} de R$ ${parseFloat(amount).toFixed(2).replace('.', ',')} por mês foi configurada.`,
        data: { screen: '/(student)/payments' },
      },
    })

    return ok({
      subscriptionId: subscription.id,
      paymentLink: subscription.paymentLink || null,
      status: subscription.status,
    })
  } catch (e) {
    return err(`Erro interno: ${String(e)}`)
  }
})
