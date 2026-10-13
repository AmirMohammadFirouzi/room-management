import * as React from 'react'
import { ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Assignment, Candidate, WeeklySchedule } from '@/lib/types'
import {
  addDaysISO,
  formatJalali,
  saturdayOf,
  toISO,
  todayISO,
} from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Avatar, AvatarGroup } from '@/components/ui/avatar'

/** Group same-day/same-task rows: two vacuuming people share one box. */
function groupDay(items: Assignment[], myId?: number) {
  const groups = new Map<string, Assignment[]>()
  for (const a of items) {
    if (myId && a.assigned_to !== myId) continue
    const key = `${a.task_type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }
  return [...groups.entries()].map(([task, list]) => ({
    key: `${list[0].date}-${task}`,
    names: list.map((a) => a.assignee_name),
    people: list.map((a) => ({ name: a.assignee_name })),
    label: list[0].task_label,
    shared: list.length > 1,
    mine: list.some((a) => myId && a.assigned_to === myId),
    done: list.every((a) => a.status === 'confirmed'),
    first: list.find((a) => !myId || a.assigned_to === myId) ?? list[0],
  }))
}

/** Weekly schedule: 7 Jalali day-cards + a substitution request dialog. */
export function SchedulePage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [weekStart, setWeekStart] = React.useState(() => toISO(saturdayOf(new Date())))
  const [schedule, setSchedule] = React.useState<WeeklySchedule | null>(null)
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [target, setTarget] = React.useState<Assignment | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [myOnly, setMyOnly] = React.useState(false)

  const today = todayISO()

  const load = React.useCallback(() => {
    api
      .get<WeeklySchedule>(`/schedule/?week=${weekStart}`)
      .then(setSchedule)
      .catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [weekStart, toast])

  React.useEffect(() => {
    load()
  }, [load])

  function changeWeek(delta: number) {
    setWeekStart(addDaysISO(weekStart, delta * 7))
  }

  async function openSubstitute(a: Assignment) {
    try {
      const list = await api.get<Candidate[]>(`/assignments/${a.id}/candidates/`)
      setCandidates(list)
      setTarget(a)
      setReason('')
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    }
  }

  async function submitSubstitute(replacement: number) {
    if (!target) return
    setBusy(true)
    try {
      await api.post('/substitutions/', {
        assignment: target.id,
        replacement,
        reason,
      })
      toast({ title: 'درخواست جایگزینی ثبت شد', variant: 'success' })
      setTarget(null)
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const byDay = React.useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (let i = 0; i < 7; i++) map.set(addDaysISO(weekStart, i), [])
    for (const a of schedule?.assignments ?? []) {
      map.get(a.date)?.push(a)
    }
    return map
  }, [schedule, weekStart])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-bold">برنامه‌ی هفتگی</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => changeWeek(-1)} aria-label="هفته‌ی قبل">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(toISO(saturdayOf(new Date())))}>
            امروز
          </Button>
          <Button variant="ghost" size="icon" onClick={() => changeWeek(1)} aria-label="هفته‌ی بعد">
            <ChevronLeft className="size-4" />
          </Button>
          <label className="ms-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={myOnly} onChange={(e) => setMyOnly(e.target.checked)} className="size-4" />
            فقط وظایف من
          </label>
        </div>
      </div>
      {schedule?.schedule_status === 'draft' && user?.is_admin && (
        <p className="rounded-control border border-warning px-3 py-2 text-center text-xs text-warning">
          این برنامه هنوز پیش‌نویس است و برای اعضا فعال نیست — از «ساخت برنامه» منتشرش کنید.
        </p>
      )}

      {!schedule?.exists ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            برای این هفته برنامه‌ای ساخته نشده است.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...byDay.entries()].map(([date, items]) => (
            <Card key={date} className={cn(date === today && 'border-brand')}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {formatJalali(date)}
                  {date === today && <Badge variant="brand">امروز</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground">بدون وظیفه</p>
                )}
                {groupDay(items, myOnly ? user?.id : undefined).map((g) => (
                  <div
                    key={g.key}
                    className={cn(
                      'flex items-center gap-2 rounded-control px-2.5 py-2 text-sm',
                      g.mine ? 'bg-secondary font-semibold' : 'bg-background',
                    )}
                  >
                    <AvatarGroup people={g.people} size="sm" />
                    <div className="min-w-0 flex-1 text-start">
                      <span className="block truncate">
                        {g.names.join(' و ')}
                        {g.shared && <span className="ms-1 text-[11px] text-muted-foreground">(مسئولیت مشترک)</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {g.label}
                        {g.done ? ' · تأیید شد' : ''}
                      </span>
                    </div>
                    {g.mine && !g.done && g.first && (
                      <Button size="sm" variant="outline" onClick={() => void openSubstitute(g.first)}>
                        <Repeat2 className="ms-1 size-3.5" /> جایگزین
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setTarget(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-overlay border-line border-border bg-popover p-5 shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-display text-base font-bold">درخواست جایگزینی</h2>
              <p className="text-xs text-muted-foreground">
                {target.task_label} · {formatJalali(target.date)} — چه کسی جای شما؟
              </p>
            </div>
            <Field label="دلیل (اختیاری)" htmlFor="reason">
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثلا: مسافرت، امتحان…"
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c.user}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitSubstitute(c.user)}
                  className="flex items-center gap-2 rounded-control border-line border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Avatar name={c.display_name} size="sm" />
                  <span className="flex-1">{c.display_name}</span>
                  {c.owes_favor && (
                    <Badge variant="warning">جبران اعتبار شما</Badge>
                  )}
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  نامزدی پیدا نشد.
                </p>
              )}
            </div>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              انصراف
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
