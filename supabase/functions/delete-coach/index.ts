import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verificar que o chamador é super_admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: callerUser } = await supabaseAdmin
      .from('users').select('role').eq('id', caller.id).single()
    if (callerUser?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { coach_user_id } = await req.json()
    if (!coach_user_id) {
      return new Response(JSON.stringify({ error: 'coach_user_id é obrigatório.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Impede exclusão da própria conta
    if (coach_user_id === caller.id) {
      return new Response(JSON.stringify({ error: 'Você não pode excluir sua própria conta.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Busca o registro de coach
    const { data: coachData } = await supabaseAdmin
      .from('coaches').select('id').eq('user_id', coach_user_id).single()
    if (!coachData) {
      return new Response(JSON.stringify({ error: 'Coach não encontrado.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Bloqueia se ainda há alunos
    const { count } = await supabaseAdmin
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachData.id)
    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: `Este coach tem ${count} aluno${count !== 1 ? 's' : ''}. Migre-os para outro treinador antes de excluir.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Exclui do auth (cascateia para public.users → public.coaches)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(coach_user_id)
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
