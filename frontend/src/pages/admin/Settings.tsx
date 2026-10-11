import * as React from 'react'
import { api } from '@/lib/api'
import type { SiteSettings } from '@/lib/types'
import { WEEKDAY_LABELS } from '@/lib/jalali'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// پیش‌فرض: دوشنبه (۲)، چهارشنبه (۴)، جمعه (۶) — شنبه = ۰
const DEFAULT_VACUUM = [2, 4, 6]

export function SettingsAdminPage() {
  const { toast } = useToast()
  const [s, setS] = React.useState<SiteSettings | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<SiteSettings>('/settings/').then(setS).catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])
  React.useEffect(() => { load() }, [load])

  function toggleDay(d: number) {
    if (!s) return
    const has = s.vacuum_days.includes(d)
    setS({ ...s, vacuum_days: has ? s.vacuum_days.filter((x) => x !== d) : [...s.vacuum_days, d].sort() })
  }

  async function save() {
    if (!s) return
    setBusy(true)
    try {
      const out = await api.put<SiteSettings>('/settings/', s)
      setS(out)
      toast({ title: 'تنظیمات ذخیره شد', variant: 'success' })
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  if (!s) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">تنظیمات برنامه</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">روزهای جاروبرقی</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                className={cn('rounded-control border px-3 py-1.5 text-sm', s.vacuum_days.includes(d) ? 'border-brand bg-brand text-brand-foreground font-semibold' : 'border-border text-muted-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>تعداد نفر در هر روز:</span>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => setS({ ...s, vacuum_people: n })}
                className={cn('size-8 rounded-control border text-sm font-bold', s.vacuum_people === n ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>
                {n}
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setS({ ...s, vacuum_days: DEFAULT_VACUUM, vacuum_people: 2 })}>بازنشانی پیش‌فرض</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">فعال/غیرفعال بودن کارها</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {([['cleaning_enabled', 'نظافت'], ['vacuuming_enabled', 'جاروبرقی'], ['cooking_enabled', 'آشپزی']] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between">
              <span>{label}</span>
              <Switch checked={s[k]} onCheckedChange={(v) => setS({ ...s, [k]: v })} />
            </div>
          ))}
          <Button onClick={save} disabled={busy}>{busy ? '…' : 'ذخیره تنظیمات'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
