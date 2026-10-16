import * as React from 'react'
import { api } from '@/lib/api'
import type { SiteSettings } from '@/lib/types'
import { WEEKDAY_LABELS } from '@/lib/jalali'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Field, Input } from '@/components/ui/input'
import { BankCard3D } from '@/components/BankCard3D'
import { cn, fa } from '@/lib/utils'

// پیش‌فرض: دوشنبه (۲)، چهارشنبه (۴)، جمعه (۶) — شنبه = ۰
const DEFAULT_VACUUM = [2, 4, 6]
const DEFAULT_COOKING = [5, 6]

/** Read an image file as a data URL (≤512KB), wiring validation + toast inline. */
function fileToDataUrl(file: File | undefined, set: (v: string) => void, onError?: (msg: string) => void): void {
  if (!file) return
  if (file.size > 512 * 1024) {
    onError?.('حجم تصویر حداکثر ۵۱۲ کیلوبایت باشد')
    return
  }
  const reader = new FileReader()
  reader.onload = () => set(String(reader.result ?? ''))
  reader.readAsDataURL(file)
}

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

  function toggleCookingDay(d: number) {
    if (!s) return
    const has = (s.cooking_days ?? []).includes(d)
    setS({ ...s, cooking_days: has ? s.cooking_days.filter((x) => x !== d) : [...s.cooking_days, d].sort() })
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
        <CardHeader className="pb-2"><CardTitle className="text-sm">روزهای آشپزی ({fa((s.cooking_days ?? []).length)} روز)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, d) => (
              <button key={d} type="button" onClick={() => toggleCookingDay(d)}
                className={cn('rounded-control border px-3 py-1.5 text-sm', (s.cooking_days ?? []).includes(d) ? 'border-brand bg-brand text-brand-foreground font-semibold' : 'border-border text-muted-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>تعداد نفر در هر روز:</span>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => setS({ ...s, cooking_people: n })}
                className={cn('size-8 rounded-control border text-sm font-bold', s.cooking_people === n ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>
                {fa(n)}
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setS({ ...s, cooking_days: DEFAULT_COOKING, cooking_people: 2 })}>بازنشانی پیش‌فرض</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">عنوان و لوگوی ورود</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان سامانه" htmlFor="st-t">
              <Input id="st-t" value={s.site_title} onChange={(e) => setS({ ...s, site_title: e.target.value })} />
            </Field>
            <Field label="لوگو (ایموجی یا ۲ حرف)" htmlFor="st-l">
              <Input id="st-l" value={s.site_logo} onChange={(e) => setS({ ...s, site_logo: e.target.value })} />
            </Field>
          </div>
          <Field label="تصویر لوگوی ورود (اختیاری، حداکثر ۵۱۲KB — جای ایموجی را می‌گیرد)" htmlFor="st-li">
            <input
              id="st-li"
              type="file"
              accept="image/*"
              onChange={(e) => fileToDataUrl(e.target.files?.[0], (v) => setS({ ...s, site_logo_image: v }), (m) => toast({ title: m, variant: 'error' }))}
              className="text-sm text-muted-foreground"
            />
          </Field>
          {s.site_logo_image && (
            <div className="flex items-center gap-3">
              <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-brand">
                <img src={s.site_logo_image} alt={s.site_title} className="size-full object-cover" />
              </span>
              <Button size="sm" variant="ghost" onClick={() => setS({ ...s, site_logo_image: '' })}>حذف تصویر لوگو</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">کارت بانکی مشترک</CardTitle></CardHeader>
        <CardContent className="flex-col flex gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام بانک" htmlFor="st-b">
              <Input id="st-b" value={s.bank_name} onChange={(e) => setS({ ...s, bank_name: e.target.value })} />
            </Field>
            <Field label="لوگوی بانک" htmlFor="st-bl">
              <Input id="st-bl" value={s.bank_logo} onChange={(e) => setS({ ...s, bank_logo: e.target.value })} />
            </Field>
            <Field label="صاحب کارت" htmlFor="st-h">
              <Input id="st-h" value={s.card_holder} onChange={(e) => setS({ ...s, card_holder: e.target.value })} />
            </Field>
            <Field label="شماره کارت (۱۶ رقم)" htmlFor="st-c">
              <Input id="st-c" dir="ltr" inputMode="numeric" value={s.card_number} onChange={(e) => setS({ ...s, card_number: e.target.value })} />
            </Field>
            <Field label="رنگ کارت" htmlFor="st-col">
              <Input id="st-col" dir="ltr" value={s.brand_color} onChange={(e) => setS({ ...s, brand_color: e.target.value })} />
            </Field>
            <Field label="تصویر لوگوی بانک (اختیاری، حداکثر ۵۱۲KB)" htmlFor="st-bi">
              <input
                id="st-bi"
                type="file"
                accept="image/*"
                onChange={(e) => fileToDataUrl(e.target.files?.[0], (v) => setS({ ...s, bank_logo_image: v }), (m) => toast({ title: m, variant: 'error' }))}
                className="text-sm text-muted-foreground"
              />
            </Field>
          </div>
          {s.bank_logo_image && (
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-secondary">
                <img src={s.bank_logo_image} alt={s.bank_name} className="size-full object-cover" />
              </span>
              <Button size="sm" variant="ghost" onClick={() => setS({ ...s, bank_logo_image: '' })}>حذف تصویر لوگوی بانک</Button>
            </div>
          )}
          <BankCard3D
            bankName={s.bank_name}
            logoLabel={s.bank_logo}
            logoImage={s.bank_logo_image || undefined}
            brandColor={s.brand_color}
            holderName={s.card_holder}
            cardNumber={s.card_number}
            subtitle="کارت مشترک اتاق"
          />
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
