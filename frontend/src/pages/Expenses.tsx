import * as React from 'react'
import { Pencil, ReceiptText, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Balance, Expense, ExpenseShare, SiteSettings } from '@/lib/types'
import { formatJalaliShort } from '@/lib/jalali'
import { cn, en, fa, formatToman } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { BankCard3D } from '@/components/BankCard3D'
import { NumberInput } from '@/components/NumberInput'

const SHARE_LABELS = {
  unpaid: 'پرداخت نشده',
  pending: 'در انتظار تأیید',
  paid: 'پرداخت شد',
  rejected: 'رد شد',
} as const
const SHARE_TONES = {
  unpaid: 'outline',
  pending: 'warning',
  paid: 'success',
  rejected: 'destructive',
} as const

/** هزینه‌ها و دنگ: سهم من، پرداخت کارت‌به‌کارت با ۴ رقم آخر کارت. */
export function ExpensesPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [balance, setBalance] = React.useState<Balance | null>(null)
  const [paying, setPaying] = React.useState<number | null>(null)
  const [activeShare, setActiveShare] = React.useState<number | null>(null)
  const [last4, setLast4] = React.useState('')
  const [showForm, setShowForm] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [amount, setAmount] = React.useState<number | null>(null)
  const [note, setNote] = React.useState('')
  const [payer, setPayer] = React.useState('')
  const [members, setMembers] = React.useState<{ id: number; display_name: string; is_active?: boolean }[]>([])
  const [selected, setSelected] = React.useState<number[]>([])
  const [settings, setSettings] = React.useState<SiteSettings | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [payFromWallet, setPayFromWallet] = React.useState(false)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [editTitle, setEditTitle] = React.useState('')
  const [editAmount, setEditAmount] = React.useState<number | null>(null)
  const [editNote, setEditNote] = React.useState('')
  const [savingEdit, setSavingEdit] = React.useState(false)
  // Bulk payment: pick several of my unpaid shares, confirm once with one card.
  const [bulkIds, setBulkIds] = React.useState<number[]>([])
  const [bulkLast4, setBulkLast4] = React.useState('')
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const load = React.useCallback(() => {
    Promise.all([
      api.get<Expense[]>('/expenses/'),
      api.get<Balance>('/expenses/balance/'),
      api.get<{ id: number; display_name: string; is_active?: boolean }[]>('/members/'),
      api.get<SiteSettings>('/settings/').catch(() => null),
    ])
      .then(([list, bal, mems, st]) => {
        setExpenses(list)
        setBalance(bal)
        // Only active roommates can share a new expense.
        const active = mems.filter((m) => m.is_active !== false)
        setMembers(active)
        setSelected((s) => (s.length === 0 ? active.map((m) => m.id) : s))
        if (st) setSettings(st)
      })
      .catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  async function submitPay(share: ExpenseShare) {
    const forShare = activeShare === share.id ? last4 : ''
    const digits = en(forShare.trim())
    if (!/^\d{4}$/.test(digits)) {
      toast({ title: '۴ رقم آخر کارت معتبر نیست', variant: 'error' })
      return
    }
    setPaying(share.id)
    try {
      await api.post(`/expenses/shares/${share.id}/pay/`, { card_last4: digits })
      toast({ title: 'ثبت شد؛ در انتظار تأیید مدیر', variant: 'success' })
      setLast4('')
      setActiveShare(null)
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setPaying(null)
    }
  }

  async function createExpense(e: React.FormEvent) {
    e.preventDefault()
    const total = amount ?? NaN
    if (!title.trim() || !Number.isFinite(total) || total < 1000) {
      toast({ title: 'نام و مبلغ معتبر وارد کنید', variant: 'error' })
      return
    }
    setCreating(true)
    try {
      await api.post('/expenses/', {
        title: title.trim(),
        total_amount: Math.round(total),
        note,
        payer_name: payer.trim() || 'مدیریت',
        member_ids: selected.length > 0 ? selected : undefined,
        pay_from_wallet: payFromWallet,
      })
      toast({
        title: payFromWallet ? 'هزینه ثبت و از کیف پول پرداخت شد' : 'هزینه ثبت و تقسیم شد',
        variant: 'success',
      })
      setTitle(''); setAmount(null); setNote(''); setPayer(''); setPayFromWallet(false); setShowForm(false)
      load()
    } catch (err) {
      toast({ title: 'خطا', description: (err as Error).message, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  // --- bulk payment: my unpaid shares, one card claim for all ----------
  const myUnpaidShares: ExpenseShare[] = React.useMemo(
    () =>
      expenses.flatMap((ex) =>
        ex.shares.filter(
          (s) => s.user === user?.id && (s.status === 'unpaid' || s.status === 'rejected'),
        ),
      ),
    [expenses, user?.id],
  )
  const bulkList = React.useMemo(
    () => myUnpaidShares.filter((s) => bulkIds.includes(s.id)),
    [myUnpaidShares, bulkIds],
  )
  const bulkTotal = bulkList.reduce((sum, s) => sum + s.amount, 0)
  const bulkTitle = React.useMemo(() => {
    const m = new Map<number, string>()
    for (const ex of expenses) m.set(ex.id, ex.title)
    return m
  }, [expenses])

  function toggleBulk(id: number) {
    setBulkIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function submitBulk() {
    if (bulkIds.length === 0) {
      toast({ title: 'حداقل یک سهم انتخاب کنید', variant: 'error' })
      return
    }
    const digits = en(bulkLast4.trim())
    if (!/^\d{4}$/.test(digits)) {
      toast({ title: '۴ رقم آخر کارت معتبر نیست', variant: 'error' })
      return
    }
    setBulkBusy(true)
    try {
      const out = await api.post<{ created: number; total: number; card_last4: string }>(
        '/expenses/shares/pay-bulk/',
        { share_ids: bulkIds, card_last4: digits },
      )
      toast({
        title: `${fa(out.created)} سهم با مجموع ${formatToman(out.total)} ثبت شد`,
        variant: 'success',
      })
      setBulkIds([])
      setBulkLast4('')
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBulkBusy(false)
    }
  }

  function toggleSel(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function openEdit(ex: Expense) {
    setEditing(ex)
    setEditTitle(ex.title)
    setEditAmount(ex.total_amount)
    setEditNote(ex.note ?? '')
  }

  async function saveEdit() {
    if (!editing) return
    if (!editTitle.trim() || !editAmount || editAmount < 1000) {
      toast({ title: 'نام و مبلغ معتبر وارد کنید', variant: 'error' })
      return
    }
    setSavingEdit(true)
    try {
      await api.patch(`/expenses/${editing.id}/`, {
        title: editTitle.trim(),
        total_amount: Math.round(editAmount),
        note: editNote,
      })
      toast({ title: 'هزینه ویرایش شد', variant: 'success' })
      setEditing(null)
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  async function removeExpense(ex: Expense) {
    if (!window.confirm(`«${ex.title}» حذف شود؟`)) return
    try {
      await api.delete(`/expenses/${ex.id}/`)
      toast({ title: 'هزینه حذف شد', variant: 'success' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-bold">هزینه‌ها و دنگ</h1>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>{showForm ? 'بستن' : 'ثبت هزینه'}</Button>
      </div>
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          <Card className={balance.unpaid_total > 0 ? 'border-warning' : ''}>
            <CardContent className="py-3 text-center"><p className="text-[11px] text-muted-foreground">بدهی من</p><p className="text-sm font-bold">{formatToman(balance.unpaid_total)}</p></CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center"><p className="text-[11px] text-muted-foreground">پرداخت‌شده</p><p className="text-sm font-bold text-success">{formatToman(balance.paid_total)}</p></CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center"><p className="text-[11px] text-muted-foreground">طلب من</p><p className="text-sm font-bold">{formatToman(balance.others_owed_to_me)}</p></CardContent>
          </Card>
        </div>
      )}
      {settings && (
        <BankCard3D
          bankName={settings.bank_name}
          logoLabel={settings.bank_logo}
          logoImage={settings.bank_logo_image || undefined}
          brandColor={settings.brand_color}
          holderName={settings.card_holder}
          cardNumber={settings.card_number}
          subtitle="کارت مشترک اتاق — برای دنگ به این کارت بزنید"
        />
      )}
      {showForm && (
        <Card className="border-brand">
          <CardHeader className="pb-2"><CardTitle className="text-sm">هزینه جدید</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createExpense} className="flex flex-col gap-3">
              <Field label="نام آیتم" htmlFor="ex-t"><Input id="ex-t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلا: خرید هفتگی" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="مبلغ (تومان)" htmlFor="ex-a">
                  <NumberInput id="ex-a" value={amount} onChange={setAmount} placeholder="۱٬۲۰۰٬۰۰۰" />
                </Field>
                <Field label="یادداشت" htmlFor="ex-n"><Input id="ex-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </div>
              <Field label="چه کسی هزینه کرد؟ (خالی = مدیریت)" htmlFor="ex-p">
                <select
                  id="ex-p"
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  className="h-10 rounded-field border border-input bg-field px-3 text-sm"
                >
                  <option value="">مدیریت</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.display_name}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
              <div><p className="mb-1.5 text-sm">تقسیم بین ({fa(selected.length)} نفر)</p>
                <div className="flex flex-wrap gap-1.5">{members.map((m) => (
                  <button key={m.id} type="button" onClick={() => toggleSel(m.id)} className={cn('rounded-control border px-2.5 py-1 text-xs', selected.includes(m.id) ? 'border-brand font-semibold' : 'border-border text-muted-foreground')}>{m.display_name}</button>
                ))}</div>
              </div>
              {/* پرداخت از کیف پول یا جداگانه — فقط برای اعضای انتخاب‌شده */}
              <label className="flex cursor-pointer items-start gap-2 rounded-control border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={payFromWallet}
                  onChange={(e) => setPayFromWallet(e.target.checked)}
                  className="mt-1 size-4 accent-[var(--brand)]"
                />
                <span>
                  <span className="block font-semibold">پرداخت از کیف پول</span>
                  <span className="block text-xs text-muted-foreground">
                    سهم هر عضو انتخاب‌شده از کیف پولش کسر و بلافاصله «پرداخت‌شده» می‌شود؛ در غیر این صورت هرکس جداگانه دنگ می‌زند.
                  </span>
                </span>
              </label>
              <Button type="submit" disabled={creating}>{creating ? '…' : 'ثبت و تقسیم'}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {/* پرداخت دسته‌ای: چند سهم پرداخت‌نشده + یک مجموع + یک ثبت */}
      {myUnpaidShares.length > 0 && (
        <Card className={cn(bulkIds.length > 0 && 'border-brand')}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>پرداخت دسته‌ای ({fa(myUnpaidShares.length)})</span>
              {bulkIds.length > 0 && (
                <Badge variant="brand">{fa(bulkIds.length)} انتخاب‌شده</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto overscroll-contain">
              {myUnpaidShares.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm',
                    bulkIds.includes(s.id)
                      ? 'border-brand bg-brand/5'
                      : 'border-border',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={bulkIds.includes(s.id)}
                    onChange={() => toggleBulk(s.id)}
                    className="size-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 flex-1 truncate" title={bulkTitle.get(s.expense)}>
                    {bulkTitle.get(s.expense) ?? 'هزینه'}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatToman(s.amount)}</span>
                  {s.status === 'rejected' && (
                    <Badge variant="destructive">رد شد</Badge>
                  )}
                </label>
              ))}
            </div>
            {bulkIds.length > 0 && (
              <div className="flex flex-col gap-2 rounded-control border border-brand/50 bg-brand/5 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {fa(bulkList.length)} سهم انتخاب شده:
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums">
                    {formatToman(bulkTotal)}
                  </span>
                </div>
                <p className="max-h-24 overflow-y-auto text-xs text-muted-foreground">
                  {bulkList.map((s) => bulkTitle.get(s.expense) ?? 'هزینه').join('، ')}
                </p>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="۴ رقم آخر"
                    value={bulkLast4}
                    onChange={(e) => setBulkLast4(e.target.value)}
                    className="h-9 max-w-36"
                  />
                  <Button size="sm" disabled={bulkBusy} onClick={() => void submitBulk()}>
                    {bulkBusy ? '…' : `ثبت پرداخت ${formatToman(bulkTotal)}`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setBulkIds([]); setBulkLast4('') }}>
                    پاک‌کردن
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {expenses.length === 0 ? (
        <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">هنوز هزینه‌ای نیست.</p>
      ) : expenses.map((ex) => {
        const mine = ex.shares.find((s) => s.user === user?.id)
        const canManage = Boolean(user?.is_admin || ex.created_by === user?.id)
        return (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ReceiptText className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{ex.title}</span>
                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" aria-label="ویرایش هزینه" onClick={() => openEdit(ex)}>
                      <Pencil className="size-3.5" strokeWidth={1.75} />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="حذف هزینه" onClick={() => void removeExpense(ex)}>
                      <Trash2 className="size-3.5 text-destructive" strokeWidth={1.75} />
                    </Button>
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatToman(ex.total_amount)} · پرداخت‌کننده: {ex.payer_name || 'مدیریت'} · ثبت: {ex.created_by_name} · {formatJalaliShort(ex.created_at.slice(0, 10))}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {mine && (
                <div className={cn('flex flex-wrap items-center gap-2 rounded-control border px-3 py-2 text-sm', mine.status === 'unpaid' && 'border-warning')}>
                  <Avatar name={mine.user_name} size="sm" />
                  <span className="flex-1">سهم من: <b>{formatToman(mine.amount)}</b></span>
                  <Badge variant={SHARE_TONES[mine.status]}>{SHARE_LABELS[mine.status]}</Badge>
                  {(mine.status === 'unpaid' || mine.status === 'rejected') && (
                    <div className="flex w-full items-center gap-2">
                      <Input dir="ltr" inputMode="numeric" maxLength={4} placeholder="۴ رقم آخر" value={activeShare === mine.id ? last4 : ''} onChange={(e) => { setActiveShare(mine.id); setLast4(e.target.value) }} className="h-9 max-w-36" />
                      <Button size="sm" disabled={paying === mine.id} onClick={() => void submitPay(mine)}>ثبت پرداخت</Button>
                    </div>
                  )}
                  {mine.payment && mine.status === 'pending' && <p className="w-full text-xs text-muted-foreground">کارت <span dir="ltr">···· {mine.payment.card_last4}</span> — در انتظار تأیید</p>}
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  {user?.is_admin ? `همه سهم‌ها (${fa(ex.shares.length)})` : 'جزئیات سهم من'}
                </summary>
                {ex.shares.map((s) => <p key={s.id} className="flex justify-between"><span>{s.user_name}</span><span>{formatToman(s.amount)} · {SHARE_LABELS[s.status]}</span></p>)}
              </details>
            </CardContent>
          </Card>
        )
      })}
      {editing && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-overlay border border-border bg-popover p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">ویرایش «{editing.title}»</h2>
            <p className="mt-1 text-xs text-muted-foreground">اگر بخشی پرداخت شده باشد، مبلغ و اعضا قفل است و فقط نام/یادداشت تغییر می‌کند.</p>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="نام آیتم" htmlFor="ex-e-t">
                <Input id="ex-e-t" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </Field>
              <Field label="مبلغ (تومان)" htmlFor="ex-e-a">
                <NumberInput id="ex-e-a" value={editAmount} onChange={setEditAmount} />
              </Field>
              <Field label="یادداشت" htmlFor="ex-e-n">
                <Input id="ex-e-n" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? '…' : 'ذخیره'}</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
