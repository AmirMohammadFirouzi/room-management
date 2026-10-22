import { api } from '@/lib/api'

/** The server's clock — the single source of truth for all dates. */
export interface ServerTime {
  /** Today (YYYY-MM-DD) on the server, in the app timezone. */
  today: string
  /** Saturday of the current week on the server. */
  week_start: string
  datetime?: string
  timezone?: string
}

let cache: ServerTime | null = null
let inflight: Promise<ServerTime> | null = null

/** Fetch once, cache forever (the date only changes at midnight anyway). */
export function fetchServerTime(): Promise<ServerTime> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = api
      .get<ServerTime>('/time/')
      .then((d) => {
        cache = d
        return d
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Already-fetched server time, or null while unknown. Never the browser clock. */
export function cachedServerTime(): ServerTime | null {
  return cache
}
