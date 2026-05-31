# Team Hard App

Consultoria Esportiva Online — Ale Mancilha

## Estrutura

```
teamhard-app/
├── mobile/          # React Native (Expo SDK 54) — app iOS + Android
├── web/             # React + Vite — painel coach/admin
└── supabase/        # SQL migrations + Edge Functions (Deno)
```

---

## Setup — Passo a Passo

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e execute as migrations **em ordem**:
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_asaas_fields.sql
   supabase/migrations/003_push_token.sql
   supabase/migrations/004_fix_assessments.sql
   supabase/migrations/005_storage_buckets.sql
   supabase/migrations/006_coaches_fields.sql
   supabase/migrations/007_assessment_scheduled_date.sql
   supabase/migrations/008_payment_urls.sql
   supabase/migrations/009_subscriptions.sql
   supabase/migrations/010_message_templates.sql
   supabase/migrations/011_anamnese_completed.sql
   ```
3. Em **Authentication → Providers**, ative o **Email** provider (desative "Confirm email" para facilitar testes)
4. Em **Storage**, confirme os buckets criados pela migration 005:
   - `assessment-photos` (privado)
   - `chat-media` (público)
5. Copie a **URL**, a **anon key** e a **service role key** do projeto

### 2. Edge Functions

No dashboard do Supabase, vá em **Project Settings → Edge Functions → Secrets** e configure:

| Variável | Descrição |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do projeto (para funções que bypassam RLS) |
| `EXPO_ACCESS_TOKEN` | Token de acesso do Expo (para push notifications) |
| `ASAAS_API_KEY` | Chave da API Asaas (ambiente sandbox ou produção) |
| `ASAAS_WEBHOOK_TOKEN` | Token para validar webhooks recebidos do Asaas |

Para fazer deploy das funções via CLI:
```bash
supabase functions deploy send-push-notification
supabase functions deploy send-welcome-message
supabase functions deploy send-reminders
supabase functions deploy create-coach
supabase functions deploy create-student
supabase functions deploy reset-student-password
supabase functions deploy asaas-create-charge
supabase functions deploy asaas-create-subscription
supabase functions deploy asaas-webhook
```

### 3. Mobile (Expo)

```bash
cd mobile
cp .env.example .env
# Edite .env com sua URL e anon key do Supabase
npm install
npx expo start
```

Para build Android:
```bash
npx expo run:android
```

### 4. Web (Coach/Admin)

```bash
cd web
cp .env.example .env
# Edite .env com sua URL e anon key do Supabase
npm install
npm run dev
```

---

## Primeiro Usuário (Super Admin)

No Supabase → **Authentication → Users**, crie um usuário manualmente.
Depois execute no SQL Editor:

```sql
UPDATE public.users
SET role = 'super_admin'
WHERE email = 'ale@teamhard.com.br';
```

---

## Variáveis de Ambiente

### Mobile (`mobile/.env`)
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### Web (`web/.env`)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

---

## Funcionalidades Implementadas

### Autenticação e Onboarding
- [x] Login com email/senha
- [x] Troca de senha obrigatória no primeiro acesso (flag `first_login`)
- [x] Anamnese de 6 blocos obrigatória antes de acessar o app (flag `anamnese_completed`)
- [x] Anamnese calcula automaticamente TMB, GET e fator de atividade
- [x] Mensagem de boas-vindas automática do coach ao aluno no primeiro login

### App Mobile — Aluno
- [x] **Treinos**: lista de divisões, detalhe com vídeo (YouTube), modo de execução com timer por série e pausa/retomada baseada em timestamp
- [x] **Feedback de treino**: nível de cansaço, dores, exercício mais difícil
- [x] **Resumo de treino** pós-sessão com duração, séries e compartilhamento
- [x] **Dieta**: checkboxes por alimento, barra de calorias em tempo real, macros
- [x] **Resumo de dieta**: gráfico de rosca (donut) com proteína/carboidratos/gorduras, metas por macro e aderência por refeição
- [x] **Chat** com o coach (texto + foto/mídia)
- [x] **Avaliações**: envio de fotos (4 ângulos), peso e notas; agenda de próxima avaliação
- [x] **Evolução**: gráficos de peso, gordura corporal e histórico de cargas por exercício
- [x] **Questionários** personalizados criados pelo coach
- [x] **Pagamentos**: visualização de status e histórico de cobranças

### App Mobile — Coach
- [x] Dashboard com resumo de alunos e feedbacks não lidos
- [x] Chat com alunos (texto + foto/mídia)
- [x] Visualização de alunos: avaliações, feedbacks de treino, treinos ativos, dietas ativas

### Painel Web — Coach
- [x] **Dashboard** com métricas e atividade recente
- [x] **Alunos**: lista, perfil completo, gráficos de evolução, histórico de sessões
- [x] **WorkoutBuilder**: montagem completa de treinos por divisão e exercício
- [x] **DietBuilder**: montagem completa de dietas por dia e refeição
- [x] **Avaliações**: galeria de fotos, métricas e comparação de antes/depois com slider arrastável
- [x] **Feedbacks**: visualização e marcação de leitura
- [x] **Questionários**: criação, envio a alunos e visualização de respostas
- [x] **Pagamentos**: criação de cobranças via Asaas, visualização de status
- [x] **Msgs Automáticas**: templates editáveis para 4 eventos (boas-vindas, treino, dieta, pagamento)
- [x] **Chat** centralizado com todos os alunos

### Painel Web — Admin (super_admin)
- [x] **Dashboard** com totais de coaches e alunos
- [x] **Coaches**: criação e gestão de contas de coach
- [x] **Biblioteca de Exercícios**: CRUD global com grupos musculares, equipamento e vídeo
- [x] **Templates de Treino**: CRUD de templates reutilizáveis para coaches
- [x] **Chat de Suporte**

### Infraestrutura e Backend
- [x] RLS completo no banco (cada usuário acessa só seus dados)
- [x] Bloqueio automático de acesso após inadimplência (trigger SQL)
- [x] Push notifications Android com 3 canais: Mensagens (MAX), Avaliações e Pagamentos (HIGH)
- [x] Cooldown de 24h para notificações locais (via SecureStore)
- [x] Mensagens automáticas disparadas por eventos (treino criado, dieta criada, cobrança gerada)
- [x] Integração Asaas: criação de cobranças avulsas e assinaturas, webhooks para atualização de status
- [x] Edge Functions com service role para operações cross-user (ex: mensagem do coach enviada a partir do login do aluno)

---

## Edge Functions

| Função | Trigger | Descrição |
|---|---|---|
| `send-push-notification` | HTTP (chamada pelo app/web) | Envia push via Expo para um usuário |
| `send-welcome-message` | HTTP (chamada pelo app no 1º login) | Insere mensagem de boas-vindas do coach → aluno |
| `send-reminders` | Cron (diário) | Verifica avaliações pendentes e pagamentos em atraso |
| `create-coach` | HTTP (admin web) | Cria usuário + registro na tabela coaches |
| `create-student` | HTTP (coach web) | Cria usuário + registro na tabela students |
| `reset-student-password` | HTTP (coach web) | Redefine senha e seta `first_login = true` |
| `asaas-create-charge` | HTTP (coach web) | Cria cobrança avulsa no Asaas |
| `asaas-create-subscription` | HTTP (coach web) | Cria assinatura recorrente no Asaas |
| `asaas-webhook` | Webhook Asaas | Atualiza status de pagamento no banco |

---

## Banco de Dados — Tabelas Principais

| Tabela | Descrição |
|---|---|
| `users` | Todos os usuários (role: super_admin / coach / student) |
| `coaches` | Perfil de coach (ligado a users) |
| `students` | Perfil de aluno com plano, pagamento e vínculo com coach |
| `anamnese` | Formulário inicial de saúde (6 blocos + TMB/GET calculados) |
| `workouts` / `workout_days` / `workout_exercises` | Estrutura de treinos por aluno |
| `workout_templates` | Templates globais de treino (criados pelo admin) |
| `training_sessions` / `session_sets` | Execução de treinos com pause/resume |
| `training_feedbacks` | Feedback pós-treino (cansaço, dores) |
| `diets` / `diet_days` / `meals` / `meal_foods` | Estrutura de dietas por aluno |
| `diet_logs` / `food_checks` | Registro diário de alimentação |
| `messages` | Chat entre coach e aluno |
| `message_templates` | Templates de mensagens automáticas por coach e tipo |
| `assessments` / `assessment_photos` | Avaliações físicas com fotos |
| `payments` | Histórico de cobranças |
| `exercises` | Biblioteca global de exercícios |
| `questionnaires` / `questionnaire_assignments` / `questionnaire_responses` | Questionários personalizados |
