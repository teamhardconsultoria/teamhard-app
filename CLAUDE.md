# TeamHard App — Documentação Técnica

## Visão Geral

Plataforma de gestão para personal trainers (coaches) e seus alunos. O coach gerencia treinos, dietas, pagamentos, avaliações físicas e comunicação. O aluno acessa seu conteúdo, registra progresso e se comunica com o coach.

**Produção:** https://teamhard-app.vercel.app  
**Supabase projeto:** `lgeifkxvrszoynbhckkg` (região: São Paulo)  
**Repositório:** https://github.com/teamhardconsultoria/teamhard-app

---

## Estrutura do Repositório (Monorepo)

```
teamhard-app/
├── web/          # App React (PWA) — principal
├── mobile/       # App Expo/React Native (em desenvolvimento)
└── supabase/
    ├── functions/    # Edge Functions Deno
    └── migrations/   # Migrations SQL numeradas sequencialmente
```

---

## Stack Tecnológica

### Frontend (web/)
- **React 18** + **TypeScript** + **Vite**
- **React Router v6** — roteamento SPA
- **Zustand** — estado global (auth, tema)
- **TailwindCSS** + estilos inline (CSS variables para theming dark/light)
- **Lucide React** — ícones
- **Recharts** — gráficos de evolução
- **@dnd-kit** — drag-and-drop (reordenação de refeições/exercícios)
- **vite-plugin-pwa** — PWA com service worker customizado (`src/sw.ts`)
- **@supabase/supabase-js** — cliente Supabase

### Backend
- **Supabase** — auth, banco PostgreSQL, storage, edge functions
- **Deno** — runtime das edge functions
- **Anthropic Claude API** — geração de treinos e dietas com IA (modelo `claude-sonnet-4-6`, multimodal com fotos de avaliação)
- **Resend** — envio de e-mails transacionais
- **Z-API** — mensagens WhatsApp
- **Eduzz** — gateway de pagamentos principal (boleto, cartão, PIX)
- **ASAAS** — gateway de pagamentos legado (mantido para histórico; novos alunos usam Eduzz)
- **Autentique** — assinatura eletrônica de contratos

### Deploy
- **Vercel** — deploy automático ao push em `main`
- **Supabase CLI** — deploy de edge functions e migrations

---

## Roles de Usuário

| Role | Acesso |
|---|---|
| `super_admin` | Tudo — gerencia coaches, visualiza todos os alunos, configurações globais |
| `coach` | Seus alunos, treinos, dietas, pagamentos, leads, comunicação |
| `student` | Seu conteúdo próprio (treino, dieta, chat, pagamentos, avaliações) |

Rota de login único: `/login`. Redirecionamento por role após autenticação:
- `super_admin` → `/admin`
- `coach` → `/coach`
- `student` → `/student/home`

---

## Principais Tabelas do Banco

### `users`
Vinculada a `auth.users`. Campos: `id`, `email`, `name`, `phone`, `role`, `avatar_url`, `first_login`.

### `coaches`
`id`, `user_id` → users, `bio`, `specialty`.

### `students`
`id`, `user_id` → users, `coach_id` → coaches, `plan_type` (nullable — null = sem plano ainda), `plan_start`, `plan_end` (nullable), `payment_status` (`active|pending|overdue|blocked`), `access_blocked`, `cpf`, `address`, `cep`, `contract_id`, `contract_status`, `diet_enabled`, `birth_date`.

### `student_invites`
Link de convite para o aluno se auto-cadastrar. `token` (UUID único), `coach_id`, `email` (opcional, pré-preenchido), `expires_at` (7 dias), `used_at`, `student_id` (preenchido após uso).

### `anamnese`
Questionário de onboarding do aluno (preenchido no primeiro login). Campos: dados pessoais, objetivos, saúde, alimentação, estilo de vida. Campo `completed` bloqueado após preenchimento. Inclui campos de fitness avançados (`fitness_level`, `gym_experience`, `has_good_technique`, `load_progressing`) usados pela IA.

### `workouts` / `workout_days` / `workout_exercises`
Estrutura hierárquica de treinos. Suporte a periodização (`workout_periodization`), exercícios de cardio (`workout_cardio`).

### `diets` / `diet_meals` / `diet_meal_foods`
Estrutura hierárquica de dietas. Macros calculados (proteína, carbo, gordura, kcal). Drag-and-drop para reordenação de refeições. Substituição de alimentos por grupo nutricional.

### `food_library`
Biblioteca global de alimentos (tabela TACO + custom). `source`: `'taco'|'custom'`. Usada para montagem de dietas e substituições.

### `assessments` / `assessment_photos`
Avaliações físicas periódicas (peso, medidas, fotos de 4 ângulos: frente, costas, esquerda, direita). Coach pode adicionar, editar e excluir avaliações. Fotos usadas pela IA na geração de planos.

### `payments`
Parcelas de pagamento. `status`: `pending|overdue|paid`. `source`: `manual|scheduled|asaas|eduzz`.

**Cron `mark-overdue-scheduled-payments`** (5h11 UTC, diário): marca parcelas `scheduled` vencidas como `overdue` e atualiza `payment_status` do aluno para `overdue`. Importante: o cron apenas move `active → overdue`; a reversão para `active` ocorre via UI quando o coach quita a parcela.

**Bug conhecido corrigido (migration 051)**: ao registrar pagamento manual (`handleRegister`), o código agora também marca como `paid` quaisquer parcelas agendadas vencidas do mesmo aluno, impedindo que o cron as reative no dia seguinte.

### `leads`
CRM Kanban de prospects. `status`: `new|contacted|interested|converted|lost`. Campo `converted_student_id` após conversão.

### `weekly_checkins`
Check-ins semanais do aluno. Base do semáforo de engajamento.

### `semaphore_status`
Calculado automaticamente (cron). `color`: `green|yellow|red` por aluno.

### `pending_messages`
Fila de mensagens automáticas (WhatsApp/e-mail). Processada por cron.

---

## Enum `plan_type`

`monthly | quarterly | semiannual | annual | permuta | legado`

- `permuta` — sem cobrança, acesso 1 ano
- `legado` — aluno migrado, renovação via Eduzz
- `null` — aluno cadastrado via convite, aguardando coach definir plano

---

## Edge Functions

| Função | Descrição |
|---|---|
| `create-student` | Cria auth user + perfil + registro de aluno. Envia e-mail e WhatsApp com senha temporária. |
| `create-coach` | Cria conta de coach (super_admin only). |
| `delete-coach` | Remove coach e seus dados (super_admin only). |
| `generate-invite` | Gera token de convite e envia e-mail ao aluno (opcional). Coach autenticado; super_admin pode passar `coach_id`. |
| `register-via-invite` | Endpoint público. Valida token e cria conta do aluno com senha própria e sem plano. |
| `reset-student-password` | Redefine senha de aluno (coach autenticado). |
| `send-contract` | Gera PDF do contrato e envia para assinatura via Autentique. |
| `send-push-notification` | Dispara push notification por VAPID. |
| `send-reminders` | Envia lembretes automáticos (cron). |
| `send-welcome-message` | Mensagem de boas-vindas via WhatsApp. |
| `rest-timer-notify` | Notificação de fim de descanso entre séries. |
| `generate-ai-plan` | Gera treino ou dieta personalizado com Claude AI. Lê anamnese + avaliação mais recente (incluindo fotos via visão computacional). Parâmetros: `student_id`, `type` (`workout`\|`diet`), `training_days` (treino), `goal_mode` (`emagrecer`\|`ganhar_massa`\|`recomposicao`) (dieta), `activity_factor_override`. Requer secret `ANTHROPIC_API_KEY`. |
| `asaas-create-charge` | Cria cobrança avulsa no ASAAS (legado). |
| `asaas-create-subscription` | Cria assinatura recorrente no ASAAS (legado). |
| `asaas-webhook` | Recebe eventos de pagamento do ASAAS (legado). |
| `eduzz-webhook` | Recebe eventos de pagamento da Eduzz. Suporta múltiplos formatos de payload (MyEduzz + formato legado). |

---

## Migrations (ordem cronológica)

```
001 — Schema inicial (tabelas core, enums, RLS)
002 — Campos ASAAS
003 — Push token
004 — Fix assessments
005 — Storage buckets
006 — Campos do coach (bio, specialty)
007 — assessment_scheduled_date
008 — URLs de pagamento
009 — Assinaturas
010 — Templates de mensagem
011 — anamnese.completed
012 — Cron jobs
013 — Conteúdo de templates
014 — Campos extras do perfil do aluno
015 — Fix trigger TMB
016 — Configurações globais
017 — Bucket de avatares
018 — Cascade ao deletar coach
019 — Treino cardio
020 — Cronograma de pagamentos (generate_payment_schedule + cron mark-overdue)
021 — Fix cronograma
022 — Correção de pagamento manual
023 — Aluno June Mazotini (seed)
024 — Override de parcelas no cronograma (p_total_installments)
025 — Drop função de cronograma antiga
026 — Diet log finalizado
027 — Plano permuta
028 — Tabela de leads (CRM)
029 — Campos de contrato no aluno (cpf, address, cep)
030 — Instagram nos leads
031 — Migração Eduzz
032 — Garante enum permuta
033 — Plano legado
034 — Fix source de pagamentos Eduzz
035 — Bloqueio de anamnese após completar
036 — Campos de fitness na anamnese
037 — Periodização de treino
038 — Permite aluno atualizar anamnese
039 — Cron de lembrete de avaliação
040 — diet_enabled no aluno
043 — Check-ins semanais
044 — Fila de mensagens (pending_messages)
045 — Crons do semáforo de engajamento
046 — Fotos de refeições
047 — Biblioteca global de alimentos (food_library)
048 — Seed TACO na food_library
049 — Tabela student_invites; plan_type e plan_end nullable
050 — p_first_paid em generate_payment_schedule (1ª parcela já paga)
051 — Fix parcelas scheduled overdue após pagamento manual
```

---

## Geração de Planos com IA

O botão **"Gerar com IA"** está disponível no WorkoutBuilder e no DietBuilder. Ao clicar, o coach pode configurar parâmetros (dias de treino, objetivo, fator de atividade) e a edge function `generate-ai-plan` é chamada.

### Fluxo
1. Lê anamnese completa do aluno (obrigatória — bloqueia se não preenchida)
2. Busca avaliação mais recente + fotos corporais (frente, costas, esquerda, direita)
3. Calcula TMB (Mifflin-St Jeor) e GET com base no peso atual
4. Envia contexto + fotos (base64, visão multimodal) para `claude-sonnet-4-6`
5. Retorna JSON estruturado que é pré-preenchido no builder para o coach revisar/editar antes de salvar

### Treino (`type: 'workout'`)
- Consulta lista de exercícios da tabela `exercises` e instrui a IA a usar apenas nomes exatos
- Considera frequência semanal, periodização, faixa etária, lesões e limitações
- Retorna: nome, periodização, dias com exercícios (séries/reps/descanso) e cardio

### Dieta (`type: 'diet'`)
- Considera restrições alimentares, alergias e preferência de número de refeições
- Calcula meta calórica e macros (proteína, gordura, carboidrato) com base no objetivo
- Retorna: 1–2 variações de dia (treino/descanso), refeições com alimentos e macros, hidratação, suplementação e substituições
- **Não substitui prescrição de nutricionista** para condições clínicas (aviso embutido no prompt)

---

## Fluxos Principais

### Cadastro de aluno pelo coach
1. Coach clica "Novo Aluno" → preenche dados + plano + pagamento
2. Edge function `create-student` → cria auth user com senha temporária
3. E-mail e WhatsApp enviados ao aluno com credenciais
4. Aluno faz login → detecta `first_login: true` → vai para anamnese obrigatória
5. Após anamnese → acesso liberado ao dashboard

### Cadastro via convite (auto-cadastro)
1. Coach clica "Convidar" → informa e-mail opcional → clica "Gerar Link"
2. Link `https://teamhard-app.vercel.app/register/:token` gerado (expira em 7 dias)
3. Se e-mail informado, e-mail de convite enviado automaticamente
4. Aluno abre o link → preenche nome, e-mail, senha, telefone
5. Conta criada sem plano (`plan_type = null`) → coach define o plano depois
6. Aluno faz login → fluxo de anamnese normal
7. `super_admin` pode gerar convite por qualquer coach usando o seletor no modal

### Primeiro login do aluno
- `first_login: true` no perfil → forçado para `/student/anamnese`
- Questionário em 5 etapas obrigatórias
- Após completar → `first_login: false`, anamnese bloqueada para edição

### Conversão de Lead para Aluno
1. Coach gerencia leads no Kanban (status: novo → contactado → interessado)
2. Ação "Converter em Aluno" → modal com dados de plano/pagamento
3. Chama a mesma edge function `create-student`
4. Lead marcado como `converted` com link para o aluno criado

### Registro de pagamento manual
1. Coach abre histórico do aluno → clica "Novo" ou "Manual"
2. Informa valor, método, data de vencimento e data de pagamento
3. `handleRegister` insere nova entrada `manual/paid`, **marca como `paid` quaisquer parcelas `scheduled/overdue`** do aluno (evita que o cron diário reverta o status) e atualiza `payment_status = 'active'`
4. Cronograma do novo período é gerado automaticamente via `generate_payment_schedule`

---

## Variáveis de Ambiente

### web/.env
```
VITE_SUPABASE_URL=https://lgeifkxvrszoynbhckkg.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

### Supabase Secrets (edge functions)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY         # Geração de treinos/dietas com IA (Claude)
RESEND_API_KEY            # E-mails transacionais
ZAPI_INSTANCE_ID          # WhatsApp via Z-API
ZAPI_TOKEN
ZAPI_CLIENT_TOKEN
ASAAS_API_KEY             # Legado
ASAAS_ENV                 # sandbox | production (legado)
AUTENTIQUE_TOKEN          # Assinatura eletrônica
EDUZZ_WEBHOOK_SECRET
VAPID_PUBLIC_KEY          # Push notifications
VAPID_PRIVATE_KEY
VAPID_CONTACT_EMAIL
APP_URL                   # URL base do app (fallback: https://teamhard-app.vercel.app)
```

---

## Padrões de Código

### Estilo visual
- **Tema dark** — CSS variables: `--bg`, `--surface`, `--border`, `--text`, `--text-2`, `--text-3`, `--overlay`
- **Cor de destaque:** `#E8FF00` (amarelo neon)
- Sem biblioteca de componentes UI — tudo com estilos inline + Tailwind pontual
- Componentes helper locais por página (ex: `ModalField`, `ModalBtn`, `ModalInput` em Students.tsx)

### Supabase
- Cliente inicializado em `web/src/lib/supabase.ts`
- RLS habilitado em todas as tabelas sensíveis
- Edge functions usam `SUPABASE_SERVICE_ROLE_KEY` para bypass de RLS
- Autenticação nas edge functions: `supabase.auth.getUser(token)` extraído do header `Authorization`

### Deploy de edge functions
```bash
supabase functions deploy <nome-da-function> --project-ref lgeifkxvrszoynbhckkg
```

### Aplicar migration pontual (sem resetar as existentes)
```bash
supabase db query --linked --file supabase/migrations/0XX_nome.sql
```
