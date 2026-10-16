import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { AppNotification } from '@/lib/types'

/** مودال تمیز برای کامل‌خوانی یک اعلان: فقط عنوان + متن کامل پیام.
 *  آیتم از والد مستقیم می‌آید (بدون فراخوانی endpoint ناموجود) و هنگام باز شدن
 *  همزمان به‌عنوان خوانده‌شده علامت‌گذاری می‌شود. */
export function NotificationModal({
  item,
  onClose,
}: {
  item: AppNotification
  onClose: () => void
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={item.title || 'پیام'}
    >
      <Card className="flex h-[80vh] max-h-[640px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                item.is_read
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-brand text-brand-foreground',
              )}
            >
              {item.is_read ? 'خوانده‌شده' : 'خوانده‌شدن'}
            </span>
            <Badge variant="outline" className="border-border">
              {item.kind_label}
            </Badge>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="aspect-square h-7 w-7"
            onClick={onClose}
            aria-label="بستن"
          >
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          <h2 className="text-xl font-bold text-foreground">{item.title || 'پیام'}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
            {item.message}
          </p>
        </CardContent>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[11px] text-muted-foreground">
            {item.kind_label} · {item.created_at_jalali}
          </p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            بستن
          </Button>
        </div>
      </Card>
    </div>
  )
}

