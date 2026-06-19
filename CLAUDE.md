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
- **Resend** — envio de e-mails transacionais
- **Z-API** — mensagens WhatsApp
- **ASAAS** — gateway de pagamentos (boleto, cartão, PIX)
- **Autentique** — assinatura eletrônica de contratos
- **Eduzz** — plataforma alternativa de pagamentos (alunos legado)

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
Questionário de onboarding do aluno (preenchido no primeiro login). Campos: dados pessoais, objetivos, saúde, alimentação, estilo de vida. Campo `completed` bloqueado após preenchimento.

### `workouts` / `workout_days` / `workout_exercises`
Estrutura hierárquica de treinos. Suporte a periodização (`workout_periodization`), exercícios de cardio (`workout_cardio`).

### `diets` / `diet_meals` / `diet_meal_foods`
Estrutura hierárquica de dietas. Macros calculados (proteína, carbo, gordura, kcal). Drag-and-drop para reordenação de refeições. Substituição de alimentos por grupo nutricional.

### `food_library`
Biblioteca global de alimentos (tabela TACO + custom). `source`: `'taco'|'custom'`. Usada para montagem de dietas e substituições.

### `assessments`
Avaliações físicas periódicas (peso, medidas, fotos).

### `payments`
Parcelas de pagamento. `status`: `pending|overdue|paid`. `source`: `manual|scheduled|asaas|eduzz`.

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
| `asaas-create-charge` | Cria cobrança avulsa no ASAAS. |
| `asaas-create-subscription` | Cria assinatura recorrente no ASAAS. |
| `asaas-webhook` | Recebe eventos de pagamento do ASAAS. |
| `eduzz-webhook` | Recebe eventos de pagamento da Eduzz. |

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
020 — Cronograma de pagamentos (generate_payment_schedule)
021 — Fix cronograma
022 — Correção de pagamento manual
023 — Aluno June Mazotini (seed)
024 — Override de parcelas no cronograma
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
```

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

### Primeiro login do aluno
- `first_login: true` no perfil → forçado para `/student/anamnese`
- Questionário em 5 etapas obrigatórias
- Após completar → `first_login: false`, anamnese bloqueada para edição

### Conversão de Lead para Aluno
1. Coach gerencia leads no Kanban (status: novo → contactado → interessado)
2. Ação "Converter em Aluno" → modal com dados de plano/pagamento
3. Chama a mesma edge function `create-student`
4. Lead marcado como `converted` com link para o aluno criado

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
RESEND_API_KEY            # E-mails transacionais
ZAPI_INSTANCE_ID          # WhatsApp via Z-API
ZAPI_TOKEN
ZAPI_CLIENT_TOKEN
ASAAS_API_KEY
ASAAS_ENV                 # sandbox | production
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
