import * as React from 'react'
import { cachedServerTime, fetchServerTime, type ServerTime } from '@/lib/serverTime'

/**
 * The server's current date. Components must use this instead of
 * `new Date()` / `todayISO()` so a wrong or skewed browser clock can never
 * show a date that is a day ahead.
 */
export function useServerTime(): ServerTime | null {
  const [time, setTime] = React.useState<ServerTime | null>(() => cachedServerTime())

  React.useEffect(() => {
    let alive = true
    fetchServerTime()
      .then((d) => {
        if (alive) setTime(d)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  return time
}

/** Server's today (YYYY-MM-DD); null until the first response arrives. */
export function useServerToday(): string | null {
  return useServerTime()?.today ?? null
}

/** Server's current Saturday (YYYY-MM-DD); null until known. */
export function useServerWeekStart(): string | null {
  return useServerTime()?.week_start ?? null
}
