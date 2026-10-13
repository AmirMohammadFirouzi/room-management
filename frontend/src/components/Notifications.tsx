import * as React from 'react'
import { Bell, CheckCheck, Inbox } from 'lucide-react'
import { markAllRead, useNotifications } from '@/hooks/useNotifications'
import { cn, fa } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/** جعبه‌ی پیام‌ها: همه‌ی اعلان‌ها + موارد در انتظار، با شمارنده‌ی زنده. */
export function NotificationsBox({ compact = false }: { compact?: boolean }) {
  const { unread, items, reload } = useNotifications()
  const [busy, setBusy] = React.useState(false)

  async function readAll() {
    setBusy(true)
    try {
      await markAllRead()
      reload()
    } finally {
      setBusy(false)
    }
  }

  const shown = compact ? items.slice(0, 4) : items

  return (
    <Card className={cn(unread > 0 && 'border-brand')}>
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
      <CardContent className="flex flex-col gap-2">
        {shown.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-3 text-center text-sm text-muted-foreground">
            <Inbox className="size-4" /> پیام تازه‌ای نیست.
          </p>
        ) : (
          shown.map((n) => (
            <div
              key={n.id}
              className={cn(
                'rounded-control border-line border-border px-3 py-2 text-sm',
                !n.is_read && 'border-brand/60 bg-brand/5 font-medium',
              )}
            >
              <p>{n.message}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {n.kind_label} · {n.created_at_jalali}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
