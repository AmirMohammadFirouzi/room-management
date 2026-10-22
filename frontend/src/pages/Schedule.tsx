import * as React from 'react'
import { ChevronLeft, ChevronRight, Repeat2, Check } from 'lucide-react'
import { api } from '@/lib/api'
import type { Assignment, User, WeeklySchedule } from '@/lib/types'
import {
  WEEKDAY_LABELS,
  addDaysISO,
  formatJalali,
  persianWeekday,
} from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth'
import { useServerToday, useServerWeekStart } from '@/hooks/useServerTime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'

/** One colour per task type — used everywhere a task is rendered. */
export const TASK_TONES: Record<string, { chip: string; dot: string }> = {
  cleaning: { chip: 'bg-brand/15 text-brand', dot: 'bg-brand' },
  vacuuming: { chip: 'bg-success/15 text-success', dot: 'bg-success' },
  cooking: { chip: 'bg-warning/15 text-warning', dot: 'bg-warning' },
}

/**
 * Color-coded task pill: نظافت / جاروبرقی / آشپزی.
 * Falls back to the Persian `task_label` when the raw `task_type` is unknown.
 */
export function TaskChip({
  assignment,
  dimmed = false,
  className,
}: {
  assignment: Assignment
  dimmed?: boolean
  className?: string
}) {
  const done = assignment.status === 'confirmed'
  const tone = TASK_TONES[assignment.task_type] ?? TASK_TONES.cleaning
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px] font-semibold',
        tone.chip,
        done && 'opacity-70',
        dimmed && 'opacity-40',
        className,
      )}
      title={`${assignment.task_label}${done ? ' · تأیید شد' : ' · در انتظار انجام'}`}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      <span className="min-w-0 truncate">{assignment.task_label}</span>
      {done && <Check className="size-3 shrink-0" strokeWidth={2} />}
    </span>
  )
}

export interface UserSummary {
  display_name: string
  avatar_image?: string
  avatar_bg?: string
  avatar_color?: string
}

export interface WeekTableProps {
  /** SERVER's Saturday (YYYY-MM-DD) — never the browser clock. */
  weekStartISO: string
  /** The SERVER's today (YYYY-MM-DD). Never the browser clock. */
  todayISO: string | null
  /** Columns: the actual active members of the room, in order. */
  userIds: number[]
  usersById: Map<number, UserSummary>
  /** Raw assignments for this week (server-supplied). */
  assignments: Assignment[]
  /** Persian weekday indexes configured for vacuuming. */
  vacuumDays?: number[]
  /** Dim every column except this member (member's personal view). */
  onlyUserId?: number | null
  /** Optional cell override (admin move button); default renders TaskChips. */
  renderCell?: (cell: {
    date: string
    userId: number
    items: Assignment[]
  }) => React.ReactNode
  emptyText?: string
}

/**
 * The weekly grid, rebuilt exactly to the requested layout:
 *   • rows    = days of the week, شنبه → جمعه
 *   • columns = room members
 *   • cells   = that person's task(s), color-coded
 *   • footer row = each member's REMAINING (unconfirmed) tasks — obvious at
 *     end of week who is still behind.
 * All dates come from `weekStartISO` via pure calendar math (addDaysISO),
 * never `new Date()`, so dates are never one day ahead.
 */
export function WeekTable({
  weekStartISO,
  todayISO,
  userIds,
  usersById,
  assignments,
  vacuumDays = [],
  onlyUserId = null,
  renderCell,
  emptyText = '—',
}: WeekTableProps) {
  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i)),
    [weekStartISO],
  )

  const byKey = React.useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of assignments) {
      const k = `${a.date}|${a.assigned_to}`
      const list = map.get(k) ?? []
      list.push(a)
      map.set(k, list)
    }
    return map
  }, [assignments])

  const remaining = React.useMemo(() => {
    const m = new Map<number, number>()
    for (const a of assignments) {
      if (a.status !== 'confirmed') {
        m.set(a.assigned_to, (m.get(a.assigned_to) ?? 0) + 1)
      }
    }
    return m
  }, [assignments])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {(['cleaning', 'vacuuming', 'cooking'] as const).map((t) => (
          <span
            key={t}
            className={cn(
              'flex items-center gap-1 rounded-control px-1.5 py-0.5 font-semibold',
              TASK_TONES[t].chip,
            )}
          >
            <span className={cn('size-1.5 rounded-full', TASK_TONES[t].dot)} />
            {t === 'cleaning' ? 'نظافت' : t === 'vacuuming' ? 'جاروبرقی' : 'آشپزی'}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-surface border border-border">
        <table className="w-full min-w-[720px] border-collapse bg-card text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 w-28 border-b border-e border-border bg-secondary px-2 py-2 text-start text-xs font-semibold text-muted-foreground">
                روز
              </th>
              {userIds.map((id) => {
                const u = usersById.get(id)
                return (
                  <th
                    key={id}
                    className={cn(
                      'min-w-24 border-b border-e border-border px-2 py-2 last:border-e-0',
                      onlyUserId != null && onlyUserId !== id && 'opacity-50',
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5 flex-col">
                      <Avatar
                        name={u?.display_name ?? `#${fa(id)}`}
                        src={u?.avatar_image || undefined}
                        color={u?.avatar_color || u?.avatar_bg || undefined}
                        size="sm"
                      />
                      <span className="truncate text-xs font-semibold mt-0.5">
                        {u?.display_name ?? `#${fa(id)}`}
                      </span>
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {days.map((date, i) => {
              const isToday = date === todayISO
              const pw = persianWeekday(new Date(date + 'T00:00:00'))
              const isVacuumDay = vacuumDays.includes(pw)
              return (
                <tr key={date} className={cn(isToday && 'bg-brand/5')}>
                  <th
                    scope="row"
                    className={cn(
                      'sticky start-0 z-10 w-28 border-b border-e border-border bg-card px-2 py-2 text-start align-top',
                      isToday && 'bg-brand/5',
                    )}
                  >
                    <span className="block text-xs font-bold">{WEEKDAY_LABELS[i]}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {formatJalali(date, false)}
                    </span>
                    {isToday && (
                      <Badge variant="brand" className="mt-0.5">
                        امروز
                      </Badge>
                    )}
                    {isVacuumDay && (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-control bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        <span className="size-1.5 rounded-full bg-success" />
                        جاروبرقی
                      </span>
                    )}
                  </th>
                  {userIds.map((id) => {
                    const items = byKey.get(`${date}|${id}`) ?? []
                    const dim = onlyUserId != null && onlyUserId !== id
                    return (
                      <td
                        key={id}
                        className={cn(
                          'border-b border-e border-border px-1.5 py-1.5 align-top last:border-e-0',
                          dim && 'opacity-50',
                        )}
                      >
                        {renderCell ? (
                          renderCell({ date, userId: id, items })
                        ) : items.length === 0 ? (
                          <span className="block py-1 text-center text-xs text-muted-foreground">
                            {emptyText}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {items.map((a) => (
                              <div key={a.id} className="flex items-center gap-1">
                                <TaskChip assignment={a} className="min-w-0 flex-1" dimmed={dim} />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            <tr className="border-t border-border bg-muted/50 font-semibold text-xs">
              <th className="sticky start-0 z-10 w-28 border-b border-e border-border px-2 py-2 text-start text-muted-foreground">
                باقیمانده
              </th>
              {userIds.map((id) => {
                const n = remaining.get(id) ?? 0
                return (
                  <td
                    key={id}
                    className={cn(
                      'border-b border-e border-border px-2 py-2 last:border-e-0 text-center',
                      n > 0 && 'text-warning font-bold',
                    )}
                  >
                    {n === 0 ? '☭' : fa(n)}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Shape of the room members used by the schedule pages. */
type ScheduleMember = User & {
  is_active?: boolean
}

export function SchedulePage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const serverToday = useServerToday()
  const serverWeekStart = useServerWeekStart()
  const [week, setWeek] = React.useState<string | null>(null)
  const [schedule, setSchedule] = React.useState<WeeklySchedule | null>(null)
  const [members, setMembers] = React.useState<ScheduleMember[]>([])
  const [vacuumDays, setVacuumDays] = React.useState<number[]>([])
  const [busy, setBusy] = React.useState(false)
  const [target, setTarget] = React.useState<Assignment | null>(null)
  const [subReason, setSubReason] = React.useState('')
  const [subBusy, setSubBusy] = React.useState(false)
  const [myOnly, setMyOnly] = React.useState(false)

  // Default target = current week, locked to the SERVER's Saturday.
  React.useEffect(() => {
    if (serverWeekStart && !week) setWeek(serverWeekStart)
  }, [serverWeekStart, week])

  const load = React.useCallback(async () => {
    if (!week) return
    try {
      const data = await api.get<WeeklySchedule>(`/schedule/?week=${week}`)
      setSchedule(data.exists ? (data as WeeklySchedule) : null)
    } catch (e) {
      setSchedule(null)
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    }
  }, [week, toast])

  React.useEffect(() => {
    void load()
    api
      .get<User[]>('/members/')
      .then((list) => setMembers(list.filter((m) => m.is_active !== false)))
      .catch(() => undefined)
    api
      .get<{ vacuum_days: number[] }>('/settings/')
      .then((s) => setVacuumDays(s.vacuum_days ?? []))
      .catch(() => undefined)
  }, [load])

  const isDraft = schedule?.exists && schedule?.schedule_status === 'draft'
  const isPublished = schedule?.exists && schedule?.schedule_status === 'published'
  const canEdit = user?.is_admin

  const userIds = React.useMemo(() => members.map((m) => m.id), [members])
  const usersById = React.useMemo(() => {
    const m = new Map<number, UserSummary>()
    for (const mem of members) {
      m.set(mem.id, {
        display_name: mem.display_name,
        avatar_image: mem.avatar_image || undefined,
        avatar_bg: mem.avatar_bg || undefined,
        avatar_color: mem.avatar_color || undefined,
      })
    }
    return m
  }, [members])

  async function generate() {
    if (!week) return
    setBusy(true)
    try {
      const out = await api.post<WeeklySchedule>('/schedule/generate/', {
        week,
        replace: schedule?.exists ?? false,
      })
      setSchedule({ ...out, exists: true })
      toast({
        title: `پیش‌نویس ساخته شد (${fa(out.assignments.length)} تکلیف)`,
        variant: 'success',
      })
    } catch (e) {
      toast({ title: 'خطا در ساخت', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!week) return
    setBusy(true)
    try {
      await api.post('/schedule/publish/', { week })
      toast({ title: 'برنامه منتشر شد و اعلان رفت', variant: 'success' })
      await load()
    } catch (e) {
      toast({ title: 'خطا در انتشار', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function submitSubstitute(replacementId: number) {
    if (!target) return
    setSubBusy(true)
    try {
      await api.post('/substitutions/', {
        assignment: target.id,
        replacement: replacementId,
        reason: subReason,
      })
      toast({ title: 'درخواست جایگزینی ثبت شد', variant: 'success' })
      setTarget(null)
      setSubReason('')
      await load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setSubBusy(false)
    }
  }

  const assignments = schedule?.assignments ?? []
  const canSubstitute = (a: Assignment) =>
    canEdit || a.assigned_to === user?.id
  const serverTodayISO = serverToday ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold">
            جدول هفته · {week ? formatJalali(week, false) : '…'}
          </h1>
          <p className="text-sm text-muted-foreground">
            روز: شنبه → جمعه از امروز برنامه
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-e-none"
            onClick={() => week && setWeek(addDaysISO(week, -7))}
            disabled={!week || !serverWeekStart}
            aria-label="هفته‌ی قبل"
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="min-w-36 px-1 text-center text-sm font-semibold">
            {week ? formatJalali(week, false) : '…'}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-s-none"
            onClick={() => week && setWeek(addDaysISO(week, 7))}
            disabled={!week}
            aria-label="هفته‌ی بعد"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => serverWeekStart && setWeek(serverWeekStart)}
            disabled={!serverWeekStart || week === serverWeekStart}
          >
            همین هفته
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => serverWeekStart && setWeek(addDaysISO(serverWeekStart, 7))}
          >
            هفته‌ی بعد
          </Button>
          {canEdit && (
            <Button
              onClick={generate}
              disabled={busy || !week || !serverWeekStart}
            >
              <Repeat2 className="ms-1 size-4" />
              {busy ? '…' : schedule?.exists ? 'بازسازی پیش‌نویس' : 'ساخت برنامه این هفته'}
            </Button>
          )}
          {canEdit && isDraft && (
            <Button variant="brand" onClick={publish} disabled={busy}>
              انتشار برنامه
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMyOnly(!myOnly)}
              className="flex items-center gap-1"
            >
              {myOnly ? 'فقط وظایف من' : 'همه وظایف'}
            </Button>
          )}
        </div>
      </div>

      {!serverWeekStart && (
        <Card className="border-warning">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              در حال دریافت تاریخ سرور…
            </p>
          </CardContent>
        </Card>
      )}

      {serverWeekStart && !schedule?.exists && (
        <Card className="border-warning">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              برای این هفته برنامه‌ای نیست.
            </p>
            {canEdit && (
              <Button
                onClick={generate}
                disabled={busy || !week}
                variant="brand"
              >
                ساخت برنامه این هفته
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {schedule?.exists && schedule.schedule_status === 'draft' && !canEdit && (
        <Card className="border-warning">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              این برنامه هنوز پیش‌نویس است و برای اعضا فعال نیست — از «ساخت برنامه» منتشرش کنید.
            </p>
          </CardContent>
        </Card>
      )}

      {schedule?.exists && (schedule.schedule_status !== 'draft' || canEdit) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              جدول هفته · {formatJalali(week!, false)}
              {isDraft && <Badge variant="warning" className="ms-2">پیش‌نویس</Badge>}
              {isPublished && <Badge variant="success" className="ms-2">منتشرشده</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeekTable
              weekStartISO={week!}
              todayISO={serverTodayISO}
              userIds={myOnly && user ? [user.id] : userIds}
              usersById={usersById}
              assignments={assignments}
              vacuumDays={vacuumDays}
              onlyUserId={myOnly && user ? user.id : null}
              renderCell={({ items }) => (
                <div className="flex flex-col gap-1">
                  {items.length === 0 ? (
                    <span className="block py-1 text-center text-xs text-muted-foreground">—</span>
                  ) : (
                    items.map((a) => (
                      <div key={a.id} className="flex items-center gap-1">
                        <TaskChip assignment={a} className="min-w-0 flex-1" />
                        {canSubstitute(a) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 shrink-0 px-1.5 text-[11px]"
                            onClick={() => void setTarget(a)}
                          >
                            <Repeat2 className="size-3" strokeWidth={1.75} />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
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
              <h2 className="font-display text-base font-bold">
                درخواست جایگزینی
              </h2>
              <p className="text-xs text-muted-foreground">
                {target.task_label} · {formatJalali(target.date)} — چه کسی جای شما؟
              </p>
            </div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              دلیل (اختیاری)
            </label>
            <Input
              value={subReason}
              onChange={(e) => setSubReason(e.target.value)}
              placeholder="مثلا: مسافرت، امتحان…"
              className="mb-3"
            />
            <div className="flex flex-col gap-1.5">
              {(() => {
                const busyIds = new Set(
                  assignments
                    .filter((a) => a.date === target!.date)
                    .map((a) => a.assigned_to),
                )
                busyIds.add(target!.assigned_to)
                const avail = members.filter(
                  (m) =>
                    m.is_active !== false &&
                    !busyIds.has(m.id) &&
                    m.id !== target!.assigned_to,
                )
                return (
                  <>
                    {avail.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={subBusy}
                        onClick={() => void submitSubstitute(m.id)}
                        className="flex items-center gap-2 rounded-control border-line border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        <Avatar name={m.display_name} size="sm" />
                        <span className="flex-1">{m.display_name}</span>
                      </button>
                    ))}
                    {avail.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground">
                        نامزدی پیدا نشد.
                      </p>
                    )}
                  </>
                )
              })()}
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

export default SchedulePage