import * as React from 'react'
import { api, getToken, setToken } from '@/lib/api'
import type { User } from '@/lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthCtx = React.createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState<boolean>(Boolean(getToken()))

  const refresh = React.useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      setUser(await api.get<User>('/auth/me/'))
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const login = React.useCallback(
    async (username: string, password: string) => {
      const data = await api.post<{ token: string; user: User }>('/auth/login/', {
        username,
        password,
      })
      setToken(data.token)
      setUser(data.user)
    },
    [],
  )

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout/')
    } catch {
      // token already gone — fine
    }
    setToken(null)
    setUser(null)
  }, [])

  const value = React.useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
