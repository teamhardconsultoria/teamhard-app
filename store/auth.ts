import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  session: any | null
  loading: boolean
  setSession: (session: any) => void
  setUser: (user: User | null) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  fetchUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    set({ session: data.session })
    await get().fetchUser()
  },


  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },

  changePassword: async (newPassword) => {
    // Atualiza o banco ANTES de chamar updateUser para evitar race condition:
    // updateUser dispara onAuthStateChange → fetchUser, que leria first_login: true
    await supabase
      .from('users')
      .update({ first_login: false })
      .eq('id', get().session?.user?.id)
    set((state) => state.user ? { user: { ...state.user, first_login: false } } : {})
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  fetchUser: async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { set({ user: null, loading: false }); return }
      const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!data) { set({ user: null, loading: false }); return }

      // Se aluno com anamnese_completed=false, confirma pela tabela anamnese
      // (autocorrige caso a coluna esteja desatualizada no banco)
      if (data.role === 'student' && !data.anamnese_completed) {
        const { data: st } = await supabase.from('students').select('id').eq('user_id', authUser.id).maybeSingle()
        if (st) {
          const { data: an } = await supabase.from('anamnese').select('completed').eq('student_id', st.id).maybeSingle()
          if (an?.completed) {
            await supabase.from('users').update({ anamnese_completed: true }).eq('id', authUser.id)
            set({ user: { ...data, anamnese_completed: true }, loading: false })
            return
          }
        }
      }

      set({ user: data, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
}))
