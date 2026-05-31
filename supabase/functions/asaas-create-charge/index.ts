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

const METHOD_LABEL: Record<string, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { student_id, amount, due_date, billing_type, cpf, description, installment_count } = await req.json()

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
    const studentCpf = (cpf || user.cpf || '').replace(/\D/g, '')

    if (!studentCpf) return err('CPF do aluno é necessário para criar cobrança no Asaas.')

    if (cpf && !user.cpf) {
      await supabase.from('users').update({ cpf }).eq('id', user.id)
    }

    let customerId = student.asaas_customer_id

    if (!customerId) {
      const search = await asaas(`/customers?cpfCnpj=${studentCpf}`)
      if (search.data?.length > 0) {
        customerId = search.data[0].id
      } else {
        const created = await asaas('/customers', 'POST', {
          name: user.name,
          cpfCnpj: studentCpf,
          email: user.email,
          mobilePhone: (user.phone || '').replace(/\D/g, '') || undefined,
        })
        if (created.errors?.length) {
          return err(`Asaas (cliente): ${created.errors[0]?.description || JSON.stringify(created.errors)}`)
        }
        if (!created.id) return err(`Asaas retornou resposta inesperada ao criar cliente: ${JSON.stringify(created)}`)
        customerId = created.id
      }
      await supabase.from('students').update({ asaas_customer_id: customerId }).eq('id', student_id)
    }

    const installments = installment_count && installment_count > 1 ? parseInt(installment_count) : 1
    const totalValue = parseFloat(amount)

    const chargePayload: Record<string, unknown> = {
      customer: customerId,
      billingType: billing_type,
      value: totalValue,
      dueDate: due_date,
      description: description || `Plano ${student.plan_type} - Team Hard`,
    }

    if (billing_type === 'CREDIT_CARD' && installments > 1) {
      chargePayload.installmentCount = installments
      chargePayload.installmentValue = parseFloat((totalValue / installments).toFixed(2))
    }

    const charge = await asaas('/payments', 'POST', chargePayload)

    if (charge.errors?.length) {
      return err(`Asaas (cobrança): ${charge.errors[0]?.description || JSON.stringify(charge.errors)}`)
    }
    if (!charge.id) return err(`Asaas retornou resposta inesperada ao criar cobrança: ${JSON.stringify(charge)}`)

    let pixEncodedImage = null
    let pixPayload = null
    if (billing_type === 'PIX') {
      const pix = await asaas(`/payments/${charge.id}/pixQrCode`)
      pixEncodedImage = pix.encodedImage || null
      pixPayload = pix.payload || null
    }

    const methodLabel = METHOD_LABEL[billing_type] ?? billing_type
    const installmentSuffix = installments > 1 ? ` em ${installments}x` : ' à vista'

    const { error: insertError } = await supabase.from('payments').insert({
      student_id,
      asaas_charge_id: charge.id,
      amount: totalValue,
      status: 'pending',
      payment_method: methodLabel + installmentSuffix,
      due_date,
      plan_type: student.plan_type,
      invoice_url: charge.invoiceUrl || null,
      bank_slip_url: charge.bankSlipUrl || null,
      pix_qr_code: pixEncodedImage,
      pix_payload: pixPayload,
    })

    if (insertError) return err(`Erro ao salvar pagamento: ${insertError.message}`)

    await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: user.id,
        title: '💳 Nova cobrança recebida',
        body: `Você tem uma cobrança de R$ ${totalValue.toFixed(2).replace('.', ',')} via ${methodLabel}${installmentSuffix}. Vencimento: ${new Date(due_date + 'T12:00:00').toLocaleDateString('pt-BR')}.`,
        data: { screen: '/(student)/payments' },
      },
    })

    return ok({
      chargeId: charge.id,
      invoiceUrl: charge.invoiceUrl || null,
      bankSlipUrl: charge.bankSlipUrl || null,
      pixEncodedImage,
      pixPayload,
    })
  } catch (e) {
    return err(`Erro interno: ${String(e)}`)
  }
})
