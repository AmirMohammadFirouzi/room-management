import * as React from 'react'
import { CalendarPlus, History, Scale } from 'lucide-react'
import { api } from '@/lib/api'
import type { Assignment, Candidate, Credit, SubstitutionRequest } from '@/lib/types'
import { formatJalali, jalaliToISO, todayISO, type JalaliDate } from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { JalaliCalendar } from '@/components/JalaliCalendar'

const STATUS_LABELS = { pending: 'در انتظار تأیید', approved: 'تأیید شد', rejected: 'رد شد' } as const
const STATUS_TONES = { pending: 'warning', approved: 'success', rejected: 'destructive' } as const

/** My substitution requests + open inverse-replacement credits. */
export function SubstitutionsPage() {
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<SubstitutionRequest[]>([])
  const [credits, setCredits] = React.useState<{ i_owe: Credit[]; owed_to_me: Credit[] } | null>(null)

  // New-request wizard: pick a date (today/future) → my task → a replacement.
  const [open, setOpen] = React.useState(false)
  const [day, setDay] = React.useState(todayISO())
  const [dayTasks, setDayTasks] = React.useState<Assignment[]>([])
  const [step, setStep] = React.useState<'date' | 'task' | 'person'>('date')
  const [target, setTarget] = React.useState<Assignment | null>(null)
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

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

  async function pickDate(iso: string) {
    setDay(iso)
    setBusy(true)
    try {
      const list = await api.get<Assignment[]>(`/assignments/?date=${iso}`)
      setDayTasks(list)
      if (list.length === 0) {
        toast({ title: 'در این روز تکلیفی ندارید', variant: 'default' })
      } else {
        setStep('task')
      }
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function pickTask(a: Assignment) {
    setBusy(true)
    try {
      const list = await api.get<Candidate[]>(`/assignments/${a.id}/candidates/`)
      setCandidates(list)
      setTarget(a)
      setStep('person')
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function submit(replacement: number) {
    if (!target) return
    setBusy(true)
    try {
      await api.post('/substitutions/', {
        assignment: target.id,
        replacement,
        reason,
      })
      toast({ title: 'درخواست جایگزینی ثبت شد', variant: 'success' })
      close()
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setStep('date')
    setTarget(null)
    setCandidates([])
    setReason('')
    setDayTasks([])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-bold">جایگزینی‌ها</h1>
        <Button onClick={() => setOpen(true)}>
          <CalendarPlus className="ms-1 size-4" />
          درخواست جایگزینی جدید
        </Button>
      </div>

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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={close}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-overlay border-line border-border bg-popover p-5 shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold">درخواست جایگزینی جدید</h2>
                <p className="text-xs text-muted-foreground">
                  {step === 'date' && '۱) تاریخ را انتخاب کنید (امروز یا آینده)'}
                  {step === 'task' && '۲) کدام تکلیف را می‌خواهید بسپارید؟'}
                  {step === 'person' && '۳) چه کسی جای شما بیاید؟'}
                </p>
              </div>
              <Badge variant="outline">{formatJalali(day)}</Badge>
            </div>

            {step === 'date' && (
              <div className="rounded-surface border-line border-border bg-card p-3">
                <JalaliCalendarPicker onPick={(iso) => void pickDate(iso)} />
              </div>
            )}

            {step === 'task' && (
              <div className="flex flex-col gap-1.5">
                {dayTasks.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickTask(a)}
                    className="flex items-center gap-2 rounded-control border-line border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Avatar name={a.assignee_name} size="sm" />
                    <span className="flex-1">
                      {a.task_label}
                      <span className="block text-xs text-muted-foreground">
                        {formatJalali(a.date)} · {a.assignee_name}
                      </span>
                    </span>
                  </button>
                ))}
                <Button variant="ghost" onClick={() => setStep('date')}>بازگشت به انتخاب تاریخ</Button>
              </div>
            )}

            {step === 'person' && (
              <div className="flex flex-col gap-1.5">
                <Field label="دلیل (اختیاری)" htmlFor="reason">
                  <Input
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثلا: مسافرت، امتحان…"
                  />
                </Field>
                {candidates.map((c) => (
                  <button
                    key={c.user}
                    type="button"
                    disabled={busy}
                    onClick={() => void submit(c.user)}
                    className="flex items-center gap-2 rounded-control border-line border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Avatar name={c.display_name} size="sm" />
                    <span className="flex-1">{c.display_name}</span>
                    {c.owes_favor && <Badge variant="warning">جبران اعتبار شما</Badge>}
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">نامزدی پیدا نشد.</p>
                )}
                <Button variant="ghost" onClick={() => setStep('task')}>بازگشت</Button>
              </div>
            )}

            <Button variant="ghost" onClick={close}>
              انصراف
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Inline Jalali calendar that reports the picked ISO date. */
function JalaliCalendarPicker({ onPick }: { onPick: (iso: string) => void }) {
  const [value, setValue] = React.useState<JalaliDate | null>(null)
  return (
    <JalaliCalendar
      value={value}
      minToday
      onChange={(d) => {
        setValue(d)
        onPick(jalaliToISO(d))
      }}
    />
  )
}
