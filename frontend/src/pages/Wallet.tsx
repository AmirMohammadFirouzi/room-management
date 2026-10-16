import * as React from 'react'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Plus, Wallet as WalletIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Balance, User, WalletData } from '@/lib/types'
import { cn, fa, formatToman } from '@/lib/utils'
import { useAuth } from '@/auth'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { NumberInput } from '@/components/NumberInput'

const TX_LABELS: Record<string, string> = {
  topup: 'شارژ کیف پول',
  expense: 'پرداخت از کیف پول',
  adjust: 'اصلاح دستی',
}

export function WalletPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [data, setData] = React.useState<WalletData | null>(null)
  const [balance, setBalance] = React.useState<Balance | null>(null)
  const [members, setMembers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [topupOpen, setTopupOpen] = React.useState(false)
  const [topupUser, setTopupUser] = React.useState<number | null>(null)
  const [topupAmount, setTopupAmount] = React.useState<number | null>(null)
  const [topupNote, setTopupNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [w, b] = await Promise.all([
        api.get<WalletData>('/wallet/'),
        api.get<Balance>('/expenses/balance/').catch(() => null),
      ])
      setData(w)
      setBalance(b)
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    void load()
    api.get<User[]>('/members/').then(setMembers).catch(() => undefined)
  }, [load])

  const credit = data?.balance ?? 0
  const debt = balance?.unpaid_total ?? 0
  const net = credit - debt
  const memberName = React.useMemo(() => {
    const m = members.find((x) => x.id === user?.id)
    return m?.display_name ?? user?.display_name ?? ''
  }, [members, user])

  async function submitTopup() {
    if (!topupUser || !topupAmount || topupAmount <= 0) {
      toast({ title: 'مبلغ را وارد کنید', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      await api.post('/wallet/topup/', {
        user_id: topupUser,
        amount: topupAmount,
        note: topupNote,
      })
      toast({ title: 'شارژ انجام شد', variant: 'success' })
      setTopupOpen(false)
      setTopupUser(null)
      setTopupAmount(null)
      setTopupNote('')
      await load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }


  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-surface bg-muted" />
        <div className="h-48 animate-pulse rounded-surface bg-muted" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-bold">کیف پول</h1>
        {user?.is_admin && (
          <Button size="sm" onClick={() => setTopupOpen((o) => !o)}>
            <Plus className="size-4" />
            شارژ کیف پول
          </Button>
        )}
      </div>

      <Card className={cn(net < 0 && 'border-destructive')}>
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <WalletIcon className={cn('size-4', net < 0 ? 'text-destructive' : 'text-brand')} strokeWidth={1.75} />
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {user?.is_admin ? `کیف پول من (${memberName})` : 'موجودی کیف پول من'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">موجودی خالص</p>
              <p
                className={cn(
                  'font-display text-2xl font-bold tabular-nums',
                  net < 0 ? 'text-destructive' : 'text-success',
                )}
              >
                {net < 0 ? `−${formatToman(Math.abs(net))}` : formatToman(net)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">شارژ کیف پول</p>
              <p className="font-display text-lg font-bold tabular-nums">{formatToman(credit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">بدهی باقی‌مانده</p>
              <p className={cn('font-display text-lg font-bold tabular-nums', debt > 0 && 'text-warning')}>
                {formatToman(debt)}
              </p>
            </div>
          </div>
          {net < 0 && (
            <p className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              بدهی، موجودی خالص کیف پول شما را منفی کرده است. برای تسویه، هزینه‌ها را پرداخت کنید یا شارژ اضافه کنید.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/expenses')}>
              <Plus className="size-4" />
              افزایش شارژ
            </Button>
            <Button variant="outline" onClick={() => navigate('/expenses')}>
              <CreditCard className="size-4" />
              صفحه‌ی پرداخت
            </Button>
          </div>
        </CardContent>
      </Card>

      {user?.is_admin && topupOpen && (
        <Card className="border-brand">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">شارژ کیف پول یک عضو</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="عضو" htmlFor="w-user">
              <select
                id="w-user"
                value={topupUser ?? ''}
                onChange={(e) => setTopupUser(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-field border border-input bg-field px-3 py-2 text-sm"
              >
                <option value="">— انتخاب کنید —</option>
                {members.filter((m) => m.is_active !== false).map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </Field>
            <Field label="مبلغ (تومان)" htmlFor="w-amt">
              <NumberInput id="w-amt" value={topupAmount} onChange={setTopupAmount} />
            </Field>
            <Field label="یادداشت" htmlFor="w-note">
              <Input id="w-note" value={topupNote} onChange={(e) => setTopupNote(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void submitTopup()} disabled={busy}>
                {busy ? '…' : 'ثبت شارژ'}
              </Button>
              <Button variant="ghost" onClick={() => setTopupOpen(false)}>انصراف</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {user?.is_admin && data?.all && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              کیف پول همه‌ی اعضا
              {typeof data.all_total === 'number' && (
                <Badge variant="success" className="ms-2">
                  جمع کل: {formatToman(data.all_total)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {data.all.length === 0 && (
              <p className="py-3 text-center text-sm text-muted-foreground">عضوی پیدا نشد.</p>
            )}
            {data.all.map((w) => (
              <div
                key={w.user}
                className="flex items-center gap-3 rounded-control border border-border px-3 py-2 text-sm"
              >
                <Avatar name={w.user_name ?? '?'} size="sm" />
                <span className="min-w-0 flex-1 truncate">{w.user_name ?? `#${fa(w.user)}`}</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    w.balance < 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {formatToman(w.balance)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">تاریخچه‌ی تراکنش‌ها</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {(data?.transactions ?? []).length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">هنوز تراکنشی ثبت نشده است.</p>
          ) : (
            (data?.transactions ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-control border border-border px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full',
                    t.amount >= 0 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
                  )}
                >
                  {t.amount >= 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    {TX_LABELS[t.kind] ?? t.kind}
                    {t.note ? ` — ${t.note}` : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t.created_at}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    t.amount >= 0 ? 'text-success' : 'text-warning',
                  )}
                >
                  {t.amount >= 0 ? '+' : '−'}{formatToman(Math.abs(t.amount))}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
