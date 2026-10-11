import * as React from 'react'
import { History, Scale } from 'lucide-react'
import { api } from '@/lib/api'
import type { Credit, SubstitutionRequest } from '@/lib/types'
import { formatJalali } from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const STATUS_LABELS = { pending: 'در انتظار تأیید', approved: 'تأیید شد', rejected: 'رد شد' } as const
const STATUS_TONES = { pending: 'warning', approved: 'success', rejected: 'destructive' } as const

/** My substitution requests + open inverse-replacement credits. */
export function SubstitutionsPage() {
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<SubstitutionRequest[]>([])
  const [credits, setCredits] = React.useState<{ i_owe: Credit[]; owed_to_me: Credit[] } | null>(null)

  const load = React.useCallback(() => {
    Promise.all([
      api.get<SubstitutionRequest[]>('/substitutions/'),
      api.get<{ i_owe: Credit[]; owed_to_me: Credit[] }>('/credits/'),
    ])
      .then(([reqs, creds]) => {
        setRequests(reqs)
        setCredits(creds)
      })
      .catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">جایگزینی‌ها</h1>

      <Card className="border-brand">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Scale className="size-4 text-brand" />
            دفتر اعتبار جبران
          </CardTitle>
          <CardDescription>
            اگر کسی جای شما کار کند، بعدا جایش را پر می‌کنید و برعکس.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(credits?.owed_to_me ?? []).map((c) => (
            <p key={c.id}>
              <span className="font-semibold text-success">{c.debtor_name}</span>{' '}
              یک جایگزینی به شما بدهکار است.
            </p>
          ))}
          {(credits?.i_owe ?? []).map((c) => (
            <p key={c.id}>
              شما یک جایگزینی به{' '}
              <span className="font-semibold text-warning">{c.creditor_name}</span>{' '}
              بدهکارید — در جایگزینی‌های او در اولویت هستید.
            </p>
          ))}
          {!credits?.i_owe?.length && !credits?.owed_to_me?.length && (
            <p className="text-muted-foreground">اعتبار بازی ندارید. همه‌چیز تسویه است.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <History className="size-4 text-brand" />
        <h2 className="text-sm font-bold">درخواست‌های من</h2>
        {requests.length > 0 && (
          <Badge variant="brand">{fa(requests.length)} مورد</Badge>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-control border-line border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          هنوز درخواستی ثبت نکرده‌اید. از صفحه‌ی برنامه، دکمه‌ی «جایگزین» را بزنید.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <Card key={r.id} className={cn(r.status === 'pending' && 'border-warning')}>
              <CardContent className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {r.replacement_name} جای {r.requested_by_name}
                  </span>
                  <Badge variant={STATUS_TONES[r.status]}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.assignment_detail?.task_label} ·{' '}
                  {r.assignment_detail && formatJalali(r.assignment_detail.date)}
                  {r.reason && <> · {r.reason}</>}
                </p>
                {r.status === 'rejected' && r.reject_reason && (
                  <p className="text-xs text-destructive">دلیل رد: {r.reject_reason}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
