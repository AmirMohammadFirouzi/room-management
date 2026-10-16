import * as React from 'react'
import { Check, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Assignment, Candidate, User, WeeklySchedule } from '@/lib/types'
import {
  WEEKDAY_LABELS,
  addDaysISO,
  formatJalali,
  saturdayOf,
  toISO,
  todayISO,
} from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'

/** Reusable week grid: rows = weekdays (Sat→Fri), columns = users, cells = task(s). */
export function WeekTable({
  weekStartISO,
  userIds,
  usersById,
  assignments,
  renderCell,
  emptyText = '—',
}: {
  weekStartISO: string
  userIds: number[]
  usersById: Map<number, { display_name: string; avatar_image?: string; avatar_bg?: string; avatar_color?: string }>
  assignments: Assignment[]
  renderCell?: (cell: { date: string; userId: number; items: Assignment[] }) => React.ReactNode
  emptyText?: string
}) {
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i)), [weekStartISO])
  const byKey = React.useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) {
      const k = `${a.date}|${a.assigned_to}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [assignments])

  return (
    <div className="overflow-x-auto rounded-surface border border-border">
      <table className="w-full min-w-[640px] border-collapse bg-card text-sm">
        <thead>
          <tr className="bg-secondary/60">
            <th className="sticky start-0 w-28 border-b border-e border-border bg-secondary/60 px-2 py-2 text-start text-xs font-semibold text-muted-foreground">
              روز
            </th>
            {userIds.map((id) => {
              const u = usersById.get(id)
              return (
                <th key={id} className="min-w-28 border-b border-e border-border px-2 py-2 last:border-e-0">
                  <span className="flex items-center justify-center gap-1.5">
                    <Avatar
                      name={u?.display_name ?? '؟'}
                      src={u?.avatar_image || undefined}
                      color={u?.avatar_color || u?.avatar_bg || undefined}
                      size="sm"
                    />
                    <span className="truncate text-xs font-semibold">{u?.display_name ?? `#${fa(id)}`}</span>
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {days.map((date) => {
            const isToday = date === todayISO()
            return (
              <tr key={date} className={cn(isToday && 'bg-brand/5')}>
                <th
                  scope="row"
                  className={cn(
                    'sticky start-0 w-28 border-b border-e border-border bg-card px-2 py-2 text-start align-top last:border-b-0',
                    isToday && 'bg-brand/5',
                  )}
                >
                  <span className="block text-xs font-bold">{WEEKDAY_LABELS[days.indexOf(date)]}</span>
                  <span className="block text-[11px] font-normal text-muted-foreground">{formatJalali(date, false)}</span>
                  {isToday && <Badge variant="brand" className="mt-0.5">امروز</Badge>}
                </th>
                {userIds.map((id) => {
                  const items = byKey.get(`${date}|${id}`) ?? []
                  return (
                    <td key={id} className="border-b border-e border-border px-1.5 py-1.5 align-top last:border-e-0">
                      {renderCell ? (
                        renderCell({ date, userId: id, items })
                      ) : items.length === 0 ? (
                        <span className="block py-1 text-center text-xs text-muted-foreground">{emptyText}</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {items.map((a) => (
                            <span
                              key={a.id}
                              className={cn(
                                'flex items-center justify-center gap-1 rounded-control px-1.5 py-1 text-[11px] font-semibold',
                                a.status === 'confirmed' ? 'bg-success/15 text-success' : 'bg-secondary text-foreground',
                              )}
                              title={`${a.task_label} · ${a.status === 'confirmed' ? 'تأیید شد' : 'در انتظار'}`}
                            >
                              {a.task_label}
                              {a.status === 'confirmed' && <Check className="size-3" strokeWidth={2} />}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


/** Weekly schedule as a day × user table + a substitution request dialog. */
export function SchedulePage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [weekStart, setWeekStart] = React.useState(() => toISO(saturdayOf(new Date())))
  const [schedule, setSchedule] = React.useState<WeeklySchedule | null>(null)
  const [members, setMembers] = React.useState<User[]>([])
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [target, setTarget] = React.useState<Assignment | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [myOnly, setMyOnly] = React.useState(false)

  const load = React.useCallback(() => {
    api
      .get<WeeklySchedule>(`/schedule/?week=${weekStart}`)
      .then(setSchedule)
      .catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [weekStart, toast])

  React.useEffect(() => {
    load()
    api.get<User[]>('/members/').then(setMembers).catch(() => undefined)
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

  const visibleAssignments = React.useMemo(
    () => (myOnly && user ? (schedule?.assignments ?? []).filter((a) => a.assigned_to === user.id) : (schedule?.assignments ?? [])),
    [schedule, myOnly, user],
  )
  const userIds = React.useMemo(() => {
    const fromSchedule = [...new Set((schedule?.assignments ?? []).map((a) => a.assigned_to))]
    const fromTable = myOnly && user ? fromSchedule.filter((id) => id === user.id) : fromSchedule
    if (fromTable.length > 0) return fromTable.sort((a, b) => a - b)
    const active = members.filter((m) => m.is_active !== false)
    const mine = myOnly && user ? active.filter((m) => m.id === user.id) : active
    return mine.map((m) => m.id)
  }, [schedule, members, myOnly, user])
  const usersById = React.useMemo(() => {
    const m = new Map<number, User>()
    for (const u of members) m.set(u.id, u)
    for (const a of schedule?.assignments ?? []) {
      if (!m.has(a.assigned_to)) {
        m.set(a.assigned_to, {
          id: a.assigned_to,
          username: '',
          display_name: a.assignee_name,
          avatar_text: a.assignee_avatar,
          avatar_color: a.assignee_color ?? '',
          avatar_bg: a.assignee_color ?? '',
          avatar_image: a.assignee_image ?? '',
          role: 'member',
          is_admin: false,
          is_active: true,
        } as User)
      }
    }
    return m
  }, [members, schedule])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-bold">برنامه‌ی هفتگی</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => changeWeek(-1)} aria-label="هفته‌ی قبل">
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(toISO(saturdayOf(new Date())))}>
            امروز
          </Button>
          <Button variant="ghost" size="icon" onClick={() => changeWeek(1)} aria-label="هفته‌ی بعد">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
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
      ) : userIds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            تکلیفی برای نمایش نیست.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              جدول هفته · {formatJalali(weekStart, false)} ({fa((schedule?.assignments ?? []).length)} تکلیف)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeekTable
              weekStartISO={weekStart}
              userIds={userIds}
              usersById={usersById}
              assignments={visibleAssignments}
              renderCell={({ items }) =>
                items.length === 0 ? (
                  <span className="block py-1 text-center text-xs text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {items.map((a) => {
                      const mine = user?.id === a.assigned_to
                      const done = a.status === 'confirmed'
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            'flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px]',
                            mine ? 'bg-secondary font-semibold' : 'bg-background',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {a.task_label}
                            {done ? ' · تأیید شد' : ''}
                          </span>
                          {mine && !done && (
                            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => void openSubstitute(a)}>
                              <Repeat2 className="size-3" strokeWidth={1.75} />
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              }
            />
          </CardContent>
        </Card>
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
                <p className="text-center text-sm text-muted-foreground">نامزدی پیدا نشد.</p>
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
