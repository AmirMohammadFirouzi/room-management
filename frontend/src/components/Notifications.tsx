import * as React from 'react'
import { Bell, CheckCheck, Inbox } from 'lucide-react'
import { markAllRead, useNotifications } from '@/hooks/useNotifications'
import { api } from '@/lib/api'
import { cn, fa } from '@/lib/utils'
import type { AppNotification } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NotificationModal } from './NotificationModal'

/** جعبه‌ی پیام‌ها: ارتفاع ثابت هم‌تراز با جعبه‌های همسایه، لیست داخل آن
 *  اسکرول‌پذیر. هر ردیف فقط عنوان + نوع/زمان را نشان می‌دهد؛ کلیک → مودال
 *  کامل (متن کامل) + علامت‌گذاری خوانده‌شده. */
export function NotificationsBox({ compact = false }: { compact?: boolean }) {
  const { unread, items, reload } = useNotifications()
  const [busy, setBusy] = React.useState(false)
  const [openItem, setOpenItem] = React.useState<AppNotification | null>(null)

  async function readAll() {
    setBusy(true)
    try {
      await markAllRead()
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function readOne(id: number) {
    setBusy(true)
    try {
      await api.post<{ unread_count: number }>('/notifications/read/', {
        ids: [id],
      })
      reload()
    } catch {
      // اتصال قطع شد — آخرین وضعیت شناخته‌شده حفظ می‌شود.
    } finally {
      setBusy(false)
    }
  }

  const shown = compact ? items.slice(0, 8) : items

  return (
    <Card
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        compact ? 'h-72' : 'max-h-[26rem]',
        unread > 0 && 'border-brand',
      )}
    >
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="relative">
            <Bell className="size-4 text-brand" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -start-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
                {fa(unread)}
              </span>
            )}
          </span>
          پیام‌ها
          {unread > 0 && <span className="text-xs font-medium text-muted-foreground">({fa(unread)} خوانده‌نشده)</span>}
        </CardTitle>
        {unread > 0 && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void readAll()}>
            <CheckCheck className="ms-1 size-3.5" /> خواندم
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {shown.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-3 text-center text-sm text-muted-foreground">
            <Inbox className="size-4" /> پیام تازه‌ای نیست.
          </p>
        ) : (
          shown.map((n) => {
            const [head] = n.message.split('\n')
            const title = (n.title || head || '').trim()
            const titleDisplay = title.length > 60 ? `${title.slice(0, 58)}…` : title
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  void readOne(n.id)
                  setOpenItem(n)
                }}
                className={cn(
                  'w-full shrink-0 overflow-hidden rounded-control border border-line px-3 py-2 text-start transition hover:-translate-y-0.5 hover:border-brand/60 hover:bg-brand/5',
                  !n.is_read && 'border-brand/60 bg-brand/5 font-medium',
                )}
              >
                <p className="truncate text-sm font-semibold" title={title}>
                  {titleDisplay}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {n.kind_label} · {n.created_at_jalali}
                </p>
              </button>
            )
          })
        )}
      </CardContent>
      {openItem !== null && (
        <NotificationModal
          item={{ ...openItem, is_read: true }}
          onClose={() => setOpenItem(null)}
        />
      )}
    </Card>
  )
}

