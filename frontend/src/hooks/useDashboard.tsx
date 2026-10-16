import * as React from 'react'
import { api } from '@/lib/api'
import type { DashboardData } from '@/lib/types'
import { useAuth } from '@/auth'

export interface DashboardState {
  data: DashboardData | null
  error: string | null
  loading: boolean
  /** Fire-and-forget refresh; keeps existing data visible while revalidating. */
  reload: () => void
}

const DashboardCtx = React.createContext<DashboardState>({
  data: null,
  error: null,
  loading: true,
  reload: () => undefined,
})

/**
 * One shared `/dashboard/` fetch for the whole shell (header badges + page).
 *
 * Before, the Layout and the Dashboard page each ran their own hook → two
 * requests with two independent states, so badges and content updated at
 * different times (visible jumps). This provider fetches once, only while a
 * user is logged in, and refetches when the account changes — never on the
 * login page, so it can't trigger 401 redirects.
 */
export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const userId = user?.id ?? null

  const reload = React.useCallback(() => {
    if (userId === null) {
      // Logged out: drop everything so the next account starts clean.
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get<DashboardData>('/dashboard/')
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  React.useEffect(() => {
    reload()
  }, [reload])

  const value = React.useMemo(
    () => ({ data, error, loading, reload }),
    [data, error, loading, reload],
  )
  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>
}

/** Shared dashboard state — one fetch, stable across pages and refreshes. */
export function useDashboard(): DashboardState {
  return React.useContext(DashboardCtx)
}

