import * as React from 'react'
import { api } from '@/lib/api'
import type { Stats } from '@/lib/types'
import { fa, faNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    </div>
  )
}
