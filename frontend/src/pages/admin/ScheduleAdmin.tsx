import * as React from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Megaphone, MoveRight } from 'lucide-react'
import { api } from '@/lib/api'
import type { Assignment, User, WeeklySchedule } from '@/lib/types'
import { addDaysISO, formatJalali, saturdayOf, toISO, todayISO } from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { WeekTable } from '@/pages/Schedule'

/** ساخت برنامه این هفته (پیش‌نویس) → جابه‌جایی آزاد → انتشار. */
export function ScheduleAdminPage() {
  const { toast } = useToast()
  const [week, setWeek] = React.useState(() => toISO(saturdayOf(new Date(new Date().getTime() + 7 * 864e5))))
  const [preview, setPreview] = React.useState<WeeklySchedule | null>(null)
  const [members, setMembers] = React.useState<User[]>([])
  const [busy, setBusy] = React.useState(false)
  const [moving, setMoving] = React.useState<Assignment | null>(null)

  const load = React.useCallback(async () => {
    try {
      setPreview(await api.get<WeeklySchedule>(`/schedule/?week=${week}`))
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    }
  }, [week, toast])

  React.useEffect(() => {
    void load()
    api.get<User[]>('/members/').then(setMembers).catch(() => undefined)
  }, [load])


  async function generate() {
    setBusy(true)
    try {
      const out = await api.post<WeeklySchedule>('/schedule/generate/', { week, replace: preview?.exists })
      setPreview({ ...out, exists: true })
      toast({ title: `پیش‌نویس ساخته شد (${fa(out.assignments.length)} تکلیف)`, variant: 'success' })
    } catch (e) { toast({ title: 'خطا در ساخت', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  async function publish() {
    setBusy(true)
    try {
      await api.post('/schedule/publish/', { week })
      toast({ title: 'برنامه منتشر شد و اعلان رفت', variant: 'success' })
      await load()
    } catch (e) { toast({ title: 'خطا در انتشار', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  async function moveTo(userId: number) {
    if (!moving) return
    setBusy(true)
    try {
      await api.post(`/assignments/${moving.id}/move/`, { assigned_to: userId })
      toast({ title: 'جابه‌جا شد', variant: 'success' })
      setMoving(null)
      await load()
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  const isDraft = preview?.exists && preview?.schedule_status === 'draft'
  const isPublished = preview?.exists && preview?.schedule_status === 'published'
  const adminUserIds = React.useMemo(() => {
    const ids = [...new Set((preview?.assignments ?? []).map((a) => a.assigned_to))].sort((a, b) => a - b)
    if (ids.length > 0) return ids
    return members.filter((m) => m.is_active !== false).map((m) => m.id)
  }, [preview, members])
  const adminUsersById = React.useMemo(() => {
    const m = new Map<number, User>()
    for (const u of members) m.set(u.id, u)
    for (const a of preview?.assignments ?? []) {
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
  }, [members, preview])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">ساخت برنامه هفتگی</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">هفته هدف (شنبه)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-control border border-border">
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-e-none" onClick={() => setWeek(addDaysISO(week, -7))} aria-label="هفته‌ی قبل">
                <ChevronRight className="size-4" />
              </Button>
              <span className="min-w-36 px-1 text-center text-sm font-semibold">
                {week ? formatJalali(week, false) : '—'}
              </span>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-s-none" onClick={() => setWeek(addDaysISO(week, 7))} aria-label="هفته‌ی بعد">
                <ChevronLeft className="size-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeek(toISO(saturdayOf(new Date())))}
              disabled={week === toISO(saturdayOf(new Date()))}
            >
              همین هفته
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeek(toISO(saturdayOf(new Date(new Date().getTime() + 7 * 864e5))))}
            >
              هفته‌ی بعد
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {preview?.exists ? `این هفته برنامه دارد (${fa(preview.assignments.length)} تکلیف).` : 'برای این هفته برنامه‌ای نیست.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={busy}>
              <CalendarPlus className="ms-1 size-4" />
              {busy ? '…' : preview?.exists ? 'بازسازی پیش‌نویس' : 'ساخت برنامه این هفته'}
            </Button>
            {isDraft && (
              <Button variant="brand" onClick={publish} disabled={busy}>
                <Megaphone className="ms-1 size-4" />
                انتشار برنامه
              </Button>
            )}
          </div>
          {isDraft && (
            <p className="text-xs text-muted-foreground">
              پیش‌نویس است؛ هر تکلیف را آزادانه جابه‌جا کنید، بعد «انتشار» را بزنید.
            </p>
          )}
        </CardContent>
      </Card>
      {preview?.exists && preview.assignments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              جدول هفته · {formatJalali(week, false)} ({fa(preview.assignments.length)})
              {isDraft && <Badge variant="warning" className="ms-2">پیش‌نویس</Badge>}
              {isPublished && <Badge variant="success" className="ms-2">منتشرشده</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeekTable
              weekStartISO={week}
              userIds={adminUserIds}
              usersById={adminUsersById}
              assignments={preview.assignments}
              renderCell={({ date, items }) => (
                <div className="flex flex-col gap-1">
                  {items.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        'flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px]',
                        date === todayISO() ? 'bg-brand/10 font-semibold' : 'bg-secondary',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{a.task_label}</span>
                      {isDraft && (
                        <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => setMoving(a)}>
                          <MoveRight className="size-3" strokeWidth={1.75} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}
      {moving && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMoving(null)}>
          <div className="w-full max-w-md rounded-overlay border border-border bg-popover p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">انتقال ({formatJalali(moving.date)})</h2>
            <div className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {members.filter((m) => m.is_active).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void moveTo(m.id)}
                  className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-start text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Avatar name={m.display_name} size="sm" />
                  <span className="flex-1">{m.display_name}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-3" onClick={() => setMoving(null)}>انصراف</Button>
          </div>
        </div>
      )}
    </div>
  )
}
