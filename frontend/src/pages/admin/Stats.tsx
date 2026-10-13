import * as React from 'react'
import { ReceiptText, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import type { Stats } from '@/lib/types'
import { fa, faNumber, formatToman } from '@/lib/utils'
import { formatJalaliShort } from '@/lib/jalali'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon3D } from '@/components/Icon3D'

export function StatsAdminPage() {
  const { toast } = useToast()
  const [stats, setStats] = React.useState<Stats | null>(null)

  React.useEffect(() => {
    api.get<Stats>('/stats/').then(setStats).catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])

  if (!stats) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
  const max = Math.max(1, ...stats.per_member.map((m) => m.total))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">آمار و تاریخچه</h1>
      {stats.financial && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-1">
              <Icon3D icon={Wallet} size="sm" />
              <CardTitle className="text-xs font-medium text-muted-foreground">جمع کل هزینه‌ها</CardTitle>
            </CardHeader>
            <CardContent><p className="font-display text-lg font-bold">{formatToman(stats.financial.total_spent)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">پرداخت‌شده</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold text-success">{formatToman(stats.financial.total_paid)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">در انتظار تأیید</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold text-warning">{formatToman(stats.financial.total_pending)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">تعداد فاکتورها</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold">{faNumber(stats.financial.invoice_count)} فاکتور</p></CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">کار هر نفر (کل تاریخچه)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stats.per_member.map((m) => (
            <div key={m.user} className="flex items-center gap-3">
              <Avatar name={m.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs"><span className="font-semibold">{m.display_name}</span><span className="text-muted-foreground">{fa(m.total)} کار · نظافت {fa(m.cleaning)} · جارو {fa(m.vacuuming)} · آشپزی {fa(m.cooking)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand" style={{ width: `${(m.total / max) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">صف‌ها</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          جایگزینی در انتظار: {faNumber(stats.queues.pending_substitutions)} · پرداخت در انتظار: {faNumber(stats.queues.pending_payments)} · هفته‌های ثبت‌شده: {faNumber(stats.history.length)}
        </CardContent>
      </Card>
      {(stats.invoices ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">همه فاکتورها ({faNumber((stats.invoices ?? []).length)})</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(stats.invoices ?? []).map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
                <ReceiptText className="size-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1 text-start">
                  <p className="truncate font-semibold">{inv.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatToman(inv.total_amount)} · پرداخت‌کننده: {inv.payer_name} · {formatJalaliShort(inv.created_at.slice(0, 10))}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
