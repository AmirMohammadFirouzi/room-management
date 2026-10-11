import * as React from 'react'
import { api } from '@/lib/api'
import type { DashboardData } from '@/lib/types'

/** Shared dashboard fetcher with a manual refresh — used by the layout
 * badges and the dashboard page. */
export function useDashboard() {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    api
      .get<DashboardData>('/dashboard/')
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  React.useEffect(() => {
    reload()
  }, [reload])

  return { data, error, reload }
}
