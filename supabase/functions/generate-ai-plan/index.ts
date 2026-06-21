import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''

    // Validate session
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user } } = await authClient.auth.getUser(authToken)
    if (!user) return json({ error: 'Não autorizado' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const body = await req.json()
    const { student_id, type, training_days, goal_mode, activity_factor_override } = body

    if (!student_id || !type) return json({ error: 'student_id e type são obrigatórios' }, 400)

    // Fetch anamnese
    const { data: anamnese } = await supabase
      .from('anamnese').select('*').eq('student_id', student_id).maybeSingle()

    if (!anamnese) return json({ error: 'Anamnese não preenchida. O aluno precisa completar o questionário primeiro.' }, 400)

    // Age calculation
    const birth = new Date(anamnese.birth_date)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--

    // Latest assessment + photos
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, weight, height, body_fat_pct, notes, created_at, photos:assessment_photos(angle, photo_url)')
      .eq('student_id', student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const weight = assessment?.weight || anamnese.current_weight
    const heightCm = anamnese.height
    const actFactor = activity_factor_override || anamnese.activity_factor || 1.375

    // Mifflin-St Jeor with latest weight
    const tmb = anamnese.biological_sex === 'male'
      ? Math.round(10 * weight + 6.25 * heightCm - 5 * age + 5)
      : Math.round(10 * weight + 6.25 * heightCm - 5 * age - 161)
    const get_val = Math.round(tmb * actFactor)

    // Fetch + encode photos as base64
    const photoBlocks: Array<Record<string, unknown>> = []
    if (assessment?.photos?.length) {
      const order = ['front', 'left', 'right', 'back']
      const sorted = [...(assessment.photos as any[])].sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle))
      const label: Record<string, string> = { front: 'Frente', left: 'Lado Esquerdo', right: 'Lado Direito', back: 'Costas' }

      for (const photo of sorted.slice(0, 4)) {
        try {
          const res = await fetch(photo.photo_url)
          if (!res.ok) continue
          const buf = await res.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let bin = ''
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
          const b64 = btoa(bin)
          const mime = res.headers.get('content-type') || 'image/jpeg'
          photoBlocks.push({ type: 'text', text: `[Foto de avaliação: ${label[photo.angle] || photo.angle}]` })
          photoBlocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } })
        } catch (_) { /* skip */ }
      }
    }

    // Build context text
    const sexLabel = anamnese.biological_sex === 'male' ? 'Masculino' : 'Feminino'
    const fitMap: Record<string, string> = { beginner: 'Iniciante (autoavaliado)', intermediate: 'Intermediário (autoavaliado)', advanced: 'Avançado (autoavaliado)' }
    const expMap: Record<string, string> = { never: 'Nunca treinou', less_6mo: '<6 meses', '6mo_2yr': '6 meses–2 anos', more_2yr: '>2 anos' }
    const restricoes = [
      anamnese.has_injury && anamnese.injury_description ? `Lesão: ${anamnese.injury_description}` : null,
      anamnese.has_limitation && anamnese.limitation_description ? `Limitação: ${anamnese.limitation_description}` : null,
      anamnese.has_disease && anamnese.disease_description ? `Condição: ${anamnese.disease_description}` : null,
    ].filter(Boolean).join(' | ') || 'Nenhuma'

    let ctx = `PERFIL:
Sexo: ${sexLabel} | Idade: ${age} anos | Altura: ${heightCm} cm
Objetivo: ${anamnese.goal || 'não informado'}
Nível declarado: ${fitMap[anamnese.fitness_level] || 'não informado'} | Exp. consistente: ${expMap[anamnese.gym_experience] || 'não informado'}
Técnica boa nos compostos: ${anamnese.has_good_technique ? 'Sim' : 'Não'} | Progressão de carga: ${anamnese.load_progressing ? 'Sim' : 'Não'}
Tipo de trabalho: ${anamnese.work_type || '?'} | Rotina corrida: ${anamnese.has_busy_routine ? 'Sim' : 'Não'}
Sono: ${anamnese.sleep_hours || '?'} h/noite | Estresse: ${anamnese.stress_level || '?'}/5
Restrições/Lesões: ${restricoes}
`

    if (assessment) {
      const aDate = new Date(assessment.created_at).toLocaleDateString('pt-BR')
      ctx += `
AVALIAÇÃO MAIS RECENTE (${aDate}):
Peso: ${assessment.weight} kg | Altura: ${assessment.height || heightCm} cm
% Gordura informado pelo coach: ${assessment.body_fat_pct != null ? `${assessment.body_fat_pct}%` : 'NÃO INFORMADO'}
TMB recalculada (Mifflin, peso atual): ${tmb} kcal | GET (fator ${actFactor}): ${get_val} kcal
Observações: ${assessment.notes || 'nenhuma'}
`
    } else {
      ctx += `\nAVALIAÇÃO: Nenhuma registrada. Peso da anamnese: ${anamnese.current_weight} kg | TMB: ${tmb} kcal | GET: ${get_val} kcal\n`
    }

    if (photoBlocks.length > 0) {
      ctx += `\n${photoBlocks.length / 2} fotos corporais anexadas para análise visual.`
      ctx += assessment?.body_fat_pct != null
        ? `\nO coach informou ${assessment.body_fat_pct}% — use como valor PRIMÁRIO. Estimativa visual = referência comparativa apenas.`
        : `\nO coach NÃO informou % de gordura — forneça estimativa visual para o coach validar. NÃO use automaticamente nos cálculos.`
    } else {
      ctx += '\nSem fotos disponíveis. Preencha visual_bf_estimate como null.\n'
    }

    // ── WORKOUT ─────────────────────────────────────────────────────────────────
    if (type === 'workout') {
      const { data: exercises } = await supabase
        .from('exercises').select('name, muscle_groups').eq('active', true).order('name').limit(300)

      const exList = (exercises || []).map((e: any) => `${e.name} (${(e.muscle_groups || []).join(', ')})`).join('\n')

      const systemPrompt = `Você é o assistente de prescrição de treino do Coach Ale Mancilha, Método Acelera!.

FILOSOFIA: Musculação para hipertrofia, emagrecimento e qualidade de vida. Baseado em evidências. Maioria das alunas: 35–50 anos, rotina corrida.

NÍVEL (nunca confiar só na autoavaliação):
• Iniciante: <6 meses OU sem domínio de compostos OU sem progressão de carga
• Intermediário: 6 meses–2 anos, progressão consistente, boa técnica
• Avançado: >2 anos, progressão avançada, excelente técnica
• Em dúvida → classifique abaixo

DIVISÃO POR FREQUÊNCIA:
2d → Full Body A/B | 3d → ABC ou PPL | 4d → Upper/Lower ou ABCD | 5d → ABCDE | 6d → PPL 2×

PARÂMETROS:
• Hipertrofia: 10–20 séries/grupo/semana, 6–15 reps, 60–120s, stretch-mediated hypertrophy, excêntrica 3s
• Emagrecimento: volume moderado, 12–20 reps, 30–60s, circuitos, consistência > intensidade
• Qualidade de vida: 10–12 séries/grupo, 15–20 reps, multiarticulares, aderência > perfeição

AJUSTES POR IDADE:
• 35–45: −10–15% volume, descanso maior | 45–55: máx 4×/sem, compostos | 55+: conservador, funcionalidade

PERIODIZAÇÃO:
• Iniciante → linear | Intermediário → ondulatória semanal | Avançado → blocos
• Deload a cada 4–10 semanas (mencionar nas coach_notes)

RESPONDA SOMENTE COM JSON VÁLIDO. Nenhum texto fora do JSON.`

      const userText = `${ctx}
FREQUÊNCIA: ${training_days || 3} dias/semana

EXERCÍCIOS DISPONÍVEIS (use SOMENTE nomes exatos desta lista):
${exList}

Retorne JSON com esta estrutura:
{
  "workout_name": "string",
  "periodization": "linear|daily_undulating|block|weekly_undulating",
  "valid_months": number,
  "justification": ["string"],
  "visual_bf_estimate": {"pct": number, "confidence": "baixa|média|alta", "note": "string"} | null,
  "needs_info": "pergunta ao coach se faltar dado crítico" | null,
  "days": [
    {
      "name": "A",
      "weekday_suggestion": [0-6],
      "exercises": [
        {"name": "nome exato da lista", "sets": 3, "reps": "10-12", "rest_seconds": 90, "coach_notes": "string"}
      ],
      "cardio": [
        {"modality": "corrida|caminhada|bike|elíptico|natação|remo|pular corda|HIIT|outro", "duration_min": 20, "intensity": "leve|moderada|intensa", "notes": "string"}
      ]
    }
  ]
}`

      const aiRes = await callAnthropic(systemPrompt, photoBlocks, userText, 6000)
      if (aiRes.error) return json({ error: aiRes.error }, 500)
      const plan = parsePlanJSON(aiRes.text)
      if (!plan) return json({ error: 'IA retornou formato inválido. Tente novamente.', raw: aiRes.text?.slice(0, 400) }, 500)
      return json({ plan })
    }

    // ── DIET ────────────────────────────────────────────────────────────────────
    const goalMap: Record<string, string> = {
      emagrecer: 'Emagrecimento (déficit calórico 300–500 kcal)',
      ganhar_massa: 'Ganho de Massa (superávit 200–400 kcal)',
      recomposicao: 'Recomposição Corporal (manutenção calórica)',
    }

    const systemPrompt = `Você é o assistente de nutrição do Coach Ale Mancilha, Método Acelera!.
AVISO: Este plano é orientação de educação física e NÃO substitui prescrição de nutricionista para condições clínicas.

CÁLCULO (Mifflin-St Jeor):
• Homem: (10×peso)+(6,25×altura)−(5×idade)+5 | Mulher: (10×peso)+(6,25×altura)−(5×idade)−161
• GET = TMB × fator_atividade
• Emagrecimento: GET−300 a 500 kcal (mín. absoluto 1.400 kcal)
• Ganho de massa: GET+200 a 400 kcal | Recomposição: GET

MACROS:
• Proteína: 1,6–2,0 g/kg (emagrecimento/ganho) | 1,8–2,2 g/kg (recomposição)
• Mulheres 40+: +0,2 g/kg adicional de proteína
• Gordura: 0,8–1,2 g/kg | Carboidratos: por diferença calórica (kcal restantes ÷ 4)
• Distribuir proteína em 4–6 refeições de 20–40 g, intervalo 3–4h

AJUSTES POR IDADE:
• 35–50 anos: proteína no topo da faixa, déficit máx 400 kcal
• 50+ anos: proteína mín 1,8 g/kg, fibra 25–30 g/dia

OBRIGATÓRIO:
• Hidratação = peso × 35 ml/dia
• Campo substitutions com opções de troca por refeição
• Regra 80/20 e notas sobre sono/estresse quando relevante
• Suplementação (whey, creatina 3–5 g, ômega-3) quando relevante

Use alimentos brasileiros comuns, nomes em português, quantidades práticas.
RESPONDA SOMENTE COM JSON VÁLIDO. Nenhum texto fora do JSON.`

    const userText = `${ctx}
OBJETIVO: ${goalMap[goal_mode] || goalMap['emagrecer']}
Restrições alimentares: ${anamnese.food_restrictions || 'Nenhuma'}
Alergias: ${anamnese.has_allergy ? anamnese.allergy_description : 'Nenhuma'}
Preferência refeições/dia: ${anamnese.meals_per_day || 'não informado'}

Gere 1 ou 2 variações de dia (ex: "Dia de Treino" e "Dia de Descanso"), 4–6 refeições cada.
Retorne JSON:
{
  "diet_name": "string",
  "justification": ["string"],
  "visual_bf_estimate": {"pct": number, "confidence": "baixa|média|alta", "note": "string"} | null,
  "needs_info": "pergunta ao coach" | null,
  "tmb": number,
  "get": number,
  "calorie_target": number,
  "macros_summary": {"protein_g": number, "fat_g": number, "carbs_g": number},
  "hydration_ml": number,
  "substitutions": "string com tabela de substituições",
  "supplementation_note": "string",
  "days": [
    {
      "label": "Dia de Treino",
      "calorie_goal": number,
      "meals": [
        {
          "name": "string",
          "suggested_time": "HH:MM",
          "foods": [
            {"name": "string", "quantity": number, "unit": "g|ml|unidade|colher|xícara|fatia|porção", "calories": number, "protein": number, "carbs": number, "fat": number}
          ]
        }
      ]
    }
  ]
}`

    const aiRes = await callAnthropic(systemPrompt, photoBlocks, userText, 8000)
    if (aiRes.error) return json({ error: aiRes.error }, 500)
    const plan = parsePlanJSON(aiRes.text)
    if (!plan) return json({ error: 'IA retornou formato inválido. Tente novamente.', raw: aiRes.text?.slice(0, 400) }, 500)
    return json({ plan })

  } catch (err: any) {
    console.error('[generate-ai-plan]', err)
    return json({ error: err.message || 'Erro interno' }, 500)
  }
})

async function callAnthropic(system: string, photoBlocks: unknown[], userText: string, maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: [...photoBlocks, { type: 'text', text: userText }] }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('[generate-ai-plan] Anthropic error:', errText)
    return { error: 'Erro na API de IA: ' + errText, text: '' }
  }
  const data = await res.json()
  return { error: null, text: data.content?.[0]?.text || '' }
}

function parsePlanJSON(text: string): unknown | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}
