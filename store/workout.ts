import { create } from 'zustand'

interface WorkoutStore {
  totalPausedMs: number
  pausedAt: number | null
  isPaused: boolean
  restEndAt: number | null
  restRemainingAtPause: number | null

  setRestEndAt: (t: number | null) => void
  pause: () => void
  resume: () => void
  clearSession: () => void
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  totalPausedMs: 0,
  pausedAt: null,
  isPaused: false,
  restEndAt: null,
  restRemainingAtPause: null,

  setRestEndAt: (t) => set({ restEndAt: t }),

  pause: () => {
    const { restEndAt } = get()
    const now = Date.now()
    set({
      isPaused: true,
      pausedAt: now,
      restRemainingAtPause: restEndAt ? Math.max(0, restEndAt - now) : null,
      restEndAt: null,
    })
  },

  resume: () => {
    const { pausedAt, totalPausedMs, restRemainingAtPause } = get()
    const now = Date.now()
    set({
      isPaused: false,
      pausedAt: null,
      totalPausedMs: totalPausedMs + (pausedAt ? now - pausedAt : 0),
      restEndAt: restRemainingAtPause ? now + restRemainingAtPause : null,
      restRemainingAtPause: null,
    })
  },

  clearSession: () => set({
    totalPausedMs: 0,
    pausedAt: null,
    isPaused: false,
    restEndAt: null,
    restRemainingAtPause: null,
  }),
}))
