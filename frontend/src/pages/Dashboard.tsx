import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, PartyPopper, Repeat2, Sparkles, Wallet } from 'lucide-react'
import { useAuth } from '@/auth'
import { api } from '@/lib/api'
import { formatJalali, todayISO } from '@/lib/jalali'
import { cn, fa, faNumber, formatToman } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useDashboard } from '@/hooks/useDashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskCard } from '@/components/TaskCard'
import { Icon3D } from '@/components/Icon3D'
import { NotificationsBox } from '@/components/Notifications'

export function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { data, reload } = useDashboard()
  const [confirmingId, setConfirmingId] = React.useState<number | null>(null)
  const navigate = useNavigate()

  const today = todayISO()
  const myToday = (data?.my_week ?? []).filter((a) => a.date === today)
  const restOfWeek = (data?.my_week ?? []).filter((a) => a.date !== today)

  async function confirm(id: number) {
    setConfirmingId(id)
    try {
      await api.post(`/assignments/${id}/confirm/`)
      toast({ title: 'آفرین! تکلیف تأیید شد', variant: 'success' })
      reload()
    } catch (e) {
      toast({
        title: 'خطا در تأیید',
        description: e instanceof Error ? e.message : 'خطایی رخ داد.',
        variant: 'error',
      })
    } finally {
      setConfirmingId(null)
    }
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-surface bg-muted" />
        ))}
      </div>
    )
  }

  const pendingTotal =
    data.pending.substitutions + data.pending.payments + data.pending.unconfirmed

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">
          سلام {user?.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">{formatJalali(today)}</p>
      </div>

      {!data.schedule_exists && (
        <Card className="border-warning">
          <CardContent className="flex items-center gap-3 py-4">
            <CalendarDays className="size-5 shrink-0 text-warning" />
            <p className="flex-1 text-sm">
              برنامه‌ی این هفته هنوز ساخته نشده است. از مدیر بخواهید برنامه را بسازد.
            </p>
            {user?.is_admin && (
              <Button size="sm" onClick={() => navigate('/admin/schedule')}>
                ساخت برنامه
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-2 md:col-span-3">
          <div className="flex items-center gap-2">
            <Icon3D icon={Sparkles} size="sm" />
            <h2 className="text-sm font-bold">وظایف امروز من</h2>
          {myToday.length > 0 && (
            <Badge variant="brand">{fa(myToday.length)} مورد</Badge>
          )}
          </div>
          {myToday.length === 0 ? (
            <p className="rounded-control border-line border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              امروز وظیفه‌ای نداری — استراحت!
            </p>
          ) : (
            myToday.map((a) => (
              <TaskCard
                key={a.id}
                assignment={a}
                showAssignee={false}
                canConfirm
                confirming={confirmingId === a.id}
                onConfirm={confirm}
                onSubstitute={() => navigate('/schedule')}
              />
            ))
          )}
          {restOfWeek.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-muted-foreground">
                بقیه‌ی وظایف این هفته
              </h2>
              {restOfWeek.map((a) => (
                <TaskCard
                  key={a.id}
                  assignment={a}
                  showAssignee={false}
                  canConfirm
                  confirming={confirmingId === a.id}
                  onConfirm={confirm}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 md:col-span-2">
          <NotificationsBox compact />
        </div>
      </section>

      {data.today.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">امروز در اتاق</h2>
          {data.today.map((a) => (
            <TaskCard key={a.id} assignment={a} />
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Card className={cn('md:col-span-2', data.balance.unpaid_total > 0 && 'border-warning')}>
          <CardHeader className="flex-row items-center gap-2 pb-1">
            <Icon3D icon={Wallet} size="sm" tone="bg-warning text-white" />
            <CardTitle className="text-xs font-medium text-muted-foreground">
              بدهی باقی‌مانده من
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.balance.unpaid_total > 0 ? (
              <>
                <p className="font-display text-xl font-bold text-warning">
                  {formatToman(data.balance.unpaid_total)}
                </p>
                <Link to="/expenses" className="text-xs text-brand hover:underline">
                  مشاهده‌ی هزینه‌ها
                </Link>
              </>
            ) : (
              <p className="flex items-center justify-center gap-2 py-1 text-center text-sm font-semibold text-success">
                <PartyPopper className="size-5" />
                حسابت صافه رفیق! بدهی نداری
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={cn(pendingTotal > 0 && 'border-brand')}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              موارد در انتظار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-lg font-bold">{fa(pendingTotal)} مورد</p>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {data.pending.unconfirmed > 0 && (
                <span>تأییدنشده: {fa(data.pending.unconfirmed)}</span>
              )}
              {data.pending.payments > 0 && (
                <span>پرداخت: {fa(data.pending.payments)}</span>
              )}
              {data.pending.substitutions > 0 && (
                <span>جایگزینی: {fa(data.pending.substitutions)}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          className="h-auto justify-start gap-2 p-4"
          onClick={() => navigate('/substitutions')}
        >
          <Repeat2 className="size-5 shrink-0 text-brand" />
          <span className="text-start">
            <span className="block text-sm font-semibold">درخواست جایگزینی</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {data.pending.substitutions > 0
                ? `${fa(data.pending.substitutions)} درخواست باز`
                : 'کسی را جای خودت بگذار'}
            </span>
          </span>
        </Button>
        <Button
          variant="secondary"
          className="h-auto justify-start gap-2 p-4"
          onClick={() => navigate('/expenses')}
        >
          <Wallet className="size-5 shrink-0 text-brand" />
          <span className="text-start">
            <span className="block text-sm font-semibold">هزینه‌ها و دنگ</span>
            <span className="block text-xs font-normal text-muted-foreground">
              پرداخت‌شده: {formatToman(data.balance.paid_total)}
            </span>
          </span>
        </Button>
      </section>

      {user?.is_admin &&
        (data.pending.pending_substitutions ?? 0) +
          (data.pending.pending_payments ?? 0) >
          0 && (
          <Card className="border-brand">
            <CardContent className="flex items-center gap-3 py-4">
              <p className="flex-1 text-sm">
                {faNumber(
                  (data.pending.pending_substitutions ?? 0) +
                    (data.pending.pending_payments ?? 0),
                )}{' '}
                مورد در صف تأیید مدیر است.
              </p>
              <Button size="sm" onClick={() => navigate('/admin/approvals')}>
                بررسی تأییدها
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  )
}
