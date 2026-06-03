import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

// ── Text wrapper ──────────────────────────────────────────────────────────────
function wrapLines(text: string, font: any, size: number, maxW: number): string[] {
  const result: string[] = []
  for (const para of text.split('\n')) {
    if (!para.trim()) { result.push(''); continue }
    const words = para.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        result.push(line); line = word
      } else { line = test }
    }
    if (line) result.push(line)
  }
  return result
}

// ── PDF generation ────────────────────────────────────────────────────────────
async function generateContractPDF(name: string, cpf: string, address: string, cep: string): Promise<Uint8Array> {
  const doc   = await PDFDocument.create()
  const font  = await doc.embedFont(StandardFonts.TimesRoman)
  const bold  = await doc.embedFont(StandardFonts.TimesRomanBold)
  const black = rgb(0, 0, 0)

  const W = 595.28, H = 841.89, ML = 65, MR = 65, MT = 55, MB = 55
  const TW = W - ML - MR
  let page = doc.addPage([W, H])
  let y = H - MT

  const newPage = () => { page = doc.addPage([W, H]); y = H - MT }
  const sp = (n = 8) => { y -= n }

  const draw = (text: string, size: number, isBold = false, indent = 0) => {
    const f = isBold ? bold : font
    for (const line of wrapLines(text, f, size, TW - indent)) {
      if (y < MB + size * 2) newPage()
      if (line) page.drawText(line, { x: ML + indent, y, size, font: f, color: black })
      y -= size * 1.45
    }
  }

  const now = new Date()

  // ── Cabeçalho
  draw('TEAM HARD Consultoria Esportiva Online', 13, true)
  sp(4)
  draw('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA ESPORTIVA ONLINE', 11, true)
  sp(16)

  draw('IDENTIFICAÇÃO DAS PARTES', 11, true)
  sp(10)

  draw('CONTRATADO (Prestador de Serviços):', 10, true)
  sp(3)
  draw('Nome: Alexandre Rodrigues Shammass de Mancilha', 10)
  draw('CPF: 365.992.338-99', 10)
  draw('Registro CBMF: 77057185', 10)
  draw('Endereço: Rua Emílio Ribas, 765 – Cambui, Campinas/SP – CEP 13025-141', 10)
  sp(8)

  draw('CONTRATANTE (Aluno/Cliente):', 10, true)
  sp(3)
  draw(`Nome: ${name || '____________________________________________'}`, 10)
  draw(`CPF: ${cpf || '____________________________________________'}`, 10)
  draw(`Endereço: ${address || '____________________________________________'}`, 10)
  draw(`CEP: ${cep || '____________________________________________'}`, 10)
  sp(12)

  draw('As partes acima identificadas celebram o presente Contrato de Prestação de Serviços de Consultoria Esportiva Online, que se regerá pelas cláusulas e condições a seguir estabelecidas.', 10)
  sp(12)

  // ── Cláusulas
  const clauses: [string, string][] = [
    ['Cláusula 1ª – DO OBJETO',
     'O CONTRATADO, na qualidade de Consultor Esportivo Online e Treinador registrado junto à Confederação Brasileira de Musculação e Fisiculturismo (CBMF), compromete-se a prestar ao CONTRATANTE serviços de consultoria esportiva online, compreendendo:\na) Elaboração, prescrição e acompanhamento de treinos personalizados;\nb) Orientação nutricional alinhada aos objetivos do CONTRATANTE;\nc) Acompanhamento de evolução física e ajustes periódicos de protocolo;\nd) Suporte e atendimento por meio do aplicativo próprio "Team Hard" e canal de comunicação via WhatsApp;\ne) Resolução de dúvidas e orientações do dia a dia relacionadas ao plano de treinamento.'],

    ['Cláusula 2ª – DO PRAZO',
     'O presente contrato terá vigência conforme definido no aplicativo "Team Hard" no momento da contratação, sendo o prazo informado ao CONTRATANTE antes da conclusão da compra.\n\nParágrafo único: Ao término do prazo contratado, o contrato poderá ser renovado mediante novo acordo entre as partes, sem renovação automática.'],

    ['Cláusula 3ª – DO VALOR E DA FORMA DE PAGAMENTO',
     'O valor total da prestação dos serviços, bem como a forma de pagamento, serão definidos e informados ao CONTRATANTE no aplicativo "Team Hard" no momento da contratação.\n\nParágrafo único: O valor poderá ser pago de forma única ou parcelada, conforme as opções disponibilizadas no aplicativo no momento da adesão.'],

    ['Cláusula 4ª – DO ATRASO NO PAGAMENTO',
     'O não pagamento de qualquer parcela ou valor na data acordada implicará, de pleno direito e independentemente de notificação, as seguintes penalidades:\na) Multa moratória de 2% (dois por cento) sobre o valor em atraso;\nb) Juros de mora de 1% (um por cento) ao mês, calculados pro rata die, a partir do vencimento;\nc) Correção monetária pelo IGP-M ou índice substituto legal, caso o atraso supere 30 (trinta) dias.\n\nParágrafo único: O atraso superior a 15 (quinze) dias corridos poderá ensejar a suspensão do acesso ao aplicativo "Team Hard" e do atendimento via WhatsApp, até que seja regularizada a pendência financeira.'],

    ['Cláusula 5ª – DO CANCELAMENTO E DA MULTA RESCISÓRIA',
     '5.1 – Cancelamento pelo CONTRATANTE: O CONTRATANTE poderá solicitar o cancelamento do contrato a qualquer momento, mediante comunicação formal ao CONTRATADO via WhatsApp ou e-mail, sujeitando-se às seguintes condições:\na) Cancelamento até 7 (sete) dias corridos após a contratação: reembolso integral dos valores pagos, nos termos do Código de Defesa do Consumidor (direito de arrependimento);\nb) Cancelamento após 7 (sete) dias da contratação: incidirá multa rescisória correspondente a 20% (vinte por cento) sobre o valor total do contrato, descontando-se proporcionalmente os serviços já prestados. O saldo remanescente, se houver, será restituído em até 10 (dez) dias úteis.\n\n5.2 – Cancelamento pelo CONTRATADO: O CONTRATADO poderá rescindir o contrato em caso de descumprimento das obrigações do CONTRATANTE, mediante aviso prévio de 5 (cinco) dias úteis, devolvendo o valor proporcional ao período não utilizado, sem incidência de multa ao CONTRATANTE.'],

    ['Cláusula 6ª – DOS HORÁRIOS DE ATENDIMENTO',
     'O atendimento pelo CONTRATADO será realizado nos seguintes horários:\na) Segunda-feira a sexta-feira: das 08h00 às 22h00;\nb) Sábados, domingos e feriados: das 08h00 às 12h00.\n\nParágrafo 1º: O CONTRATADO compromete-se a responder mensagens e solicitações enviadas pelo CONTRATANTE no prazo máximo de 24 horas úteis, contadas a partir do recebimento da mensagem dentro dos horários de atendimento estabelecidos.\n\nParágrafo 2º: Mensagens recebidas fora dos horários de atendimento serão consideradas recebidas no início do próximo período, para fins de contagem do prazo — sem que isso configure descumprimento contratual.'],

    ['Cláusula 7ª – DAS OBRIGAÇÕES DO CONTRATADO',
     'O CONTRATADO compromete-se a:\na) Prestar os serviços com dedicação, ética profissional e técnica atualizada;\nb) Elaborar protocolos personalizados de acordo com o perfil, objetivos e histórico de saúde informados pelo CONTRATANTE;\nc) Manter sigilo sobre todas as informações pessoais e de saúde do CONTRATANTE;\nd) Responder às mensagens dentro dos horários de atendimento estabelecidos na Cláusula 6ª.'],

    ['Cláusula 8ª – DAS OBRIGAÇÕES DO CONTRATANTE',
     'O CONTRATANTE compromete-se a:\na) Fornecer informações verdadeiras e completas sobre seu estado de saúde, histórico de lesões, limitações físicas e objetivos;\nb) Comunicar imediatamente qualquer alteração de saúde que possa impactar a execução do plano de treino;\nc) Consultar profissional médico antes de iniciar o programa de treinamento, especialmente em caso de doenças preexistentes;\nd) Respeitar os horários de atendimento e comunicar-se de forma respeitosa e objetiva;\ne) Efetuar os pagamentos nas datas acordadas.'],

    ['Cláusula 9ª – DA RESPONSABILIDADE E LIMITAÇÃO',
     'Os serviços prestados pelo CONTRATADO têm caráter exclusivamente esportivo e de orientação física, não substituindo acompanhamento médico, nutricional clínico ou qualquer outra especialidade de saúde. O CONTRATADO não se responsabiliza por lesões decorrentes da execução incorreta dos exercícios prescritos, da omissão de informações de saúde pelo CONTRATANTE ou do uso indevido dos protocolos orientados.'],

    ['Cláusula 10ª – DA PRIVACIDADE E PROTEÇÃO DE DADOS',
     'Os dados pessoais do CONTRATANTE serão tratados em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei 13.709/2018), sendo utilizados exclusivamente para fins de prestação dos serviços contratados. O CONTRATANTE autoriza o uso de imagens e resultados (antes/depois) para fins de divulgação em redes sociais pelo prazo de 10 (dez) anos contados a partir da data de assinatura deste contrato.'],

    ['Cláusula 11ª – DO FORO',
     'As partes elegem o Foro da Comarca de Campinas/SP para dirimir quaisquer dúvidas ou controvérsias oriundas do presente instrumento, renunciando a qualquer outro, por mais privilegiado que seja.'],
  ]

  for (const [title, body] of clauses) {
    draw(title, 10, true)
    sp(3)
    draw(body, 10)
    sp(10)
  }

  draw('E por estarem de pleno acordo com todas as cláusulas e condições acima estabelecidas, as partes firmam o presente contrato em 2 (duas) vias de igual teor e forma, na data informada abaixo.', 10)
  sp(14)

  draw(`Campinas/SP, ${now.getDate()} de ${MESES_PT[now.getMonth()]} de ${now.getFullYear()}.`, 10)
  sp(28)

  draw('CONTRATADO – Alexandre Rodrigues Shammass de Mancilha', 10, true)
  draw('CPF: 365.992.338-99  |  Reg. CBMF: 77057185', 10)
  sp(4)
  draw('_________________________________________________', 10)
  sp(24)

  draw(`CONTRATANTE – ${name}`, 10, true)
  if (cpf) draw(`CPF: ${cpf}`, 10)
  sp(4)
  draw('_________________________________________________', 10)

  return await doc.save()
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { student_id, name, email, cpf, address, cep } = await req.json()
    if (!name) return new Response(JSON.stringify({ error: 'name é obrigatório.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Persist contract fields on student record
    if (student_id) {
      await supabase.from('students').update({ cpf: cpf || null, address: address || null, cep: cep || null }).eq('id', student_id)
    }

    // Generate PDF
    const pdfBytes = await generateContractPDF(name, cpf || '', address || '', cep || '')

    const autentiqueToken = Deno.env.get('AUTENTIQUE_TOKEN')

    // ── Fallback: no token → return PDF as base64
    if (!autentiqueToken) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
      return new Response(JSON.stringify({ pdf_base64: base64 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Upload to Autentique
    const operations = JSON.stringify({
      query: `mutation CreateDocumentMutation($document: DocumentInput!, $signatories: [SignatoryInput!]!) {
        createDocument(document: $document, signatories: $signatories) {
          id name
          signatories { id link name email }
        }
      }`,
      variables: {
        document: { name: `Contrato Team Hard – ${name}` },
        signatories: [{
          email,
          name,
          action: 'SIGN',
          ...(cpf ? { cpf: cpf.replace(/\D/g, '') } : {}),
        }],
      },
    })

    const formData = new FormData()
    formData.append('operations', operations)
    formData.append('map', JSON.stringify({ '0': ['variables.document.content'] }))
    formData.append('0', new Blob([pdfBytes], { type: 'application/pdf' }), 'contrato_team_hard.pdf')

    const autentiqueRes = await fetch('https://api.autentique.com.br/2/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${autentiqueToken}` },
      body: formData,
    })

    const result = await autentiqueRes.json()

    if (result.errors) {
      return new Response(JSON.stringify({ error: result.errors[0]?.message || 'Erro no Autentique.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const docData = result.data?.createDocument
    const signatoryLink = docData?.signatories?.find((s: any) => s.email === email)?.link

    if (student_id && docData?.id) {
      await supabase.from('students').update({ contract_id: docData.id, contract_status: 'pending' }).eq('id', student_id)
    }

    return new Response(JSON.stringify({ document_id: docData?.id, link: signatoryLink }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
