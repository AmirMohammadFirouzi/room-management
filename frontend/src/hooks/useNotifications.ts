import * as React from 'react'
import { api } from '@/lib/api'
import type { AppNotification } from '@/lib/types'

interface NotificationsState {
  unread: number
  items: AppNotification[]
  reload: () => void
}

/** Live notifications feed (polled) for the badge counter + inbox box. */
export function useNotifications(pollMs = 30000): NotificationsState {
  const [unread, setUnread] = React.useState(0)
  const [items, setItems] = React.useState<AppNotification[]>([])

  const reload = React.useCallback(() => {
    api
      .get<{ unread_count: number; items: AppNotification[] }>('/notifications/')
      .then((d) => {
        setUnread(d.unread_count)
        setItems(d.items)
      })
      .catch(() => {
        /* offline — keep the last known state */
      })
  }, [])

  React.useEffect(() => {
    reload()
    const t = window.setInterval(reload, pollMs)
    return () => window.clearInterval(t)
  }, [reload, pollMs])

  return { unread, items, reload }
}

/** Mark every notification as read. */
export async function markAllRead(): Promise<number> {
  const d = await api.post<{ unread_count: number }>('/notifications/read/', {})
  return d.unread_count
}
