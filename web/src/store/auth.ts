import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface User {
  id: string
  email: string
  role: 'super_admin' | 'coach' | 'student'
  name: string
  first_login: boolean
}

interface AuthStore {
  user: User | null
  loading: boolean
  initAuth: () => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  initAuth: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchUser(set, session.user.id)
      else set({ loading: false })
    })
    supabase.auth.onAuthStateChange((_e, session) => {
      if (session) fetchUser(set, session.user.id)
      else set({ user: null, loading: false })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))

async function fetchUser(set: any, id: string) {
  const { data } = await supabase.from('users').select('*').eq('id', id).single()
  set({ user: data, loading: false })
}
