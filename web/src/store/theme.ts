const KEY = 'teamhard-theme'

export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) || 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(KEY, theme)
}

export function toggleTheme(): Theme {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function initTheme() {
  applyTheme(getTheme())
}
