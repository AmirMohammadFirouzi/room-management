import * as React from 'react'
import { CreditCard, ReceiptText } from 'lucide-react'
import { api } from '@/lib/api'
import type { Balance, Expense, ExpenseShare, SiteSettings } from '@/lib/types'
import { formatJalaliShort } from '@/lib/jalali'
import { cn, en, fa, formatToman } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { BankCard3D } from '@/components/BankCard3D'
import { Icon3D } from '@/components/Icon3D'
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
      })
      toast({ title: 'هزینه ثبت و تقسیم شد', variant: 'success' })
      setTitle(''); setAmount(null); setNote(''); setPayer(''); setShowForm(false)
      load()
    } catch (err) {
      toast({ title: 'خطا', description: (err as Error).message, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  function toggleSel(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
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
              <Button type="submit" disabled={creating}>{creating ? '…' : 'ثبت و تقسیم'}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {expenses.length === 0 ? (
        <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">هنوز هزینه‌ای نیست.</p>
      ) : expenses.map((ex) => {
        const mine = ex.shares.find((s) => s.user === user?.id)
        return (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon3D icon={ReceiptText} size="sm" />
                {ex.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatToman(ex.total_amount)} · پرداخت‌کننده: {ex.payer_name || 'مدیریت'} · ثبت: {ex.created_by_name} · {formatJalaliShort(ex.created_at.slice(0, 10))}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {mine && (
                <div className={cn('flex flex-wrap items-center gap-2 rounded-control border px-3 py-2 text-sm', mine.status === 'unpaid' && 'border-warning')}>
                  <span className="flex-1">سهم من: <b>{formatToman(mine.amount)}</b></span>
                  <Badge variant={SHARE_TONES[mine.status]}>{SHARE_LABELS[mine.status]}</Badge>
                  {(mine.status === 'unpaid' || mine.status === 'rejected') && (
                    <div className="flex w-full items-center gap-2">
                      <Input dir="ltr" inputMode="numeric" maxLength={4} placeholder="۴ رقم آخر" value={activeShare === mine.id ? last4 : ''} onChange={(e) => { setActiveShare(mine.id); setLast4(e.target.value) }} className="h-9 max-w-36" />
                      <Button size="sm" disabled={paying === mine.id} onClick={() => void submitPay(mine)}><CreditCard className="ms-1 size-3.5" /> ثبت پرداخت</Button>
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
    </div>
  )
}
