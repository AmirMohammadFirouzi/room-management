import * as React from 'react'
import { api } from '@/lib/api'
import type { WeeklySchedule } from '@/lib/types'
import { addDaysISO, formatJalali, saturdayOf, toISO } from '@/lib/jalali'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'

export function ScheduleAdminPage() {
  const { toast } = useToast()
  const [week, setWeek] = React.useState(() => toISO(saturdayOf(new Date(new Date().getTime() + 7 * 864e5))))
  const [preview, setPreview] = React.useState<WeeklySchedule | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function load() {
    try { setPreview(await api.get<WeeklySchedule>(`/schedule/?week=${week}`)) }
    catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'error' }) }
  }
  React.useEffect(() => { void load() }, [week]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true)
    try {
      const out = await api.post<WeeklySchedule>('/schedule/generate/', { week, replace: preview?.exists })
      setPreview({ ...out, exists: true })
      toast({ title: `${out.assignments.length} تکلیف ساخته شد`, variant: 'success' })
    } catch (e) { toast({ title: 'خطا در ساخت', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">ساخت برنامه هفتگی</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">هفته هدف (شنبه)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeek(addDaysISO(week, -7))}>هفته قبل</Button>
            <Button variant="outline" size="sm" onClick={() => setWeek(toISO(saturdayOf(new Date(new Date().getTime() + 7 * 864e5))))}>هفته بعد</Button>
          </div>
          <Field label="شروع هفته (شنبه، میلادی)" htmlFor="w"><Input id="w" dir="ltr" type="date" value={week} onChange={(e) => setWeek(e.target.value)} /></Field>
          {week && <p className="text-xs text-muted-foreground">معادل شمسی: {formatJalali(week)}</p>}
          <p className="text-sm text-muted-foreground">
            {preview?.exists ? `این هفته برنامه دارد (${preview.assignments.length} تکلیف). ساخت مجدد جایگزین می‌شود.` : 'برای این هفته برنامه‌ای نیست.'}
          </p>
          <Button onClick={generate} disabled={busy}>{busy ? 'در حال ساخت…' : preview?.exists ? 'بازسازی برنامه' : 'ساخت برنامه'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
