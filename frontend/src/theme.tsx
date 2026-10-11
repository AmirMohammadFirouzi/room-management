import * as React from 'react'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggle: () => void
}

const ThemeCtx = React.createContext<ThemeState | null>(null)

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Dark/light mode via the VibeFarsi token sets (گرافیت / کاغذ). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>(() => {
    const saved = localStorage.getItem('room_theme')
    return saved === 'light' ? 'light' : 'dark'
  })

  React.useEffect(() => {
    apply(theme)
    localStorage.setItem('room_theme', theme)
  }, [theme])

  const toggle = React.useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = React.useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeState {
  const ctx = React.useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
