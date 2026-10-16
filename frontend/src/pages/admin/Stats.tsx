import * as React from 'react'
import { ReceiptText } from 'lucide-react'
import { api } from '@/lib/api'
import type { Stats } from '@/lib/types'
import { fa, faNumber, formatToman } from '@/lib/utils'
import { formatJalaliShort } from '@/lib/jalali'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Dependency-free horizontal bar chart (HTML) — constrained & readable.
 *
 * Rendered as fixed-height rows (not a scaled SVG) so items never grow with
 * the card width, labels truncate with the full text on hover, and the whole
 * list scrolls inside a capped container instead of overflowing the card. */
function Bars({ rows, max }: { rows: { label: string; value: number; color: string }[]; max: number }) {
  const safe = Math.max(1, max)
  return (
    <div className="flex max-h-64 flex-col gap-2 overflow-y-auto overscroll-contain pe-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span
            className="w-20 shrink-0 truncate text-xs text-muted-foreground sm:w-28"
            title={r.label}
          >
            {r.label}
          </span>
          <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.max(2, ((r.value || 0) / safe) * 100)}%`,
                backgroundColor: r.color,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-end text-xs font-semibold tabular-nums">
            {faNumber(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Tiny dependency-free donut (SVG) for paid vs pending vs unpaid. */
function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((s, p) => s + (p.value || 0), 0))
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0" role="img" aria-label="نمودار وضعیت پرداخت">
        <circle cx={70} cy={70} r={R} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={20} />
        {parts.map((p) => {
          const frac = (p.value || 0) / total
          const el = (
            <circle
              key={p.label}
              cx={70}
              cy={70}
              r={R}
              fill="none"
              stroke={p.color}
              strokeWidth={20}
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-offset * C}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
            />
          )
          offset += frac
          return el
        })}
        <text x={70} y={74} textAnchor="middle" fontSize="13" fontWeight="bold" fill="currentColor">
          {faNumber(parts.reduce((s, p) => s + (p.value || 0), 0))}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 text-xs">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="font-semibold">{p.label}</span>
            <span className="text-muted-foreground">{formatToman(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const BAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#16A34A', '#0891B2', '#EA580C', '#CA8A04', '#4F46E5']

export function StatsAdminPage() {
  const { toast } = useToast()
  const [stats, setStats] = React.useState<Stats | null>(null)

  React.useEffect(() => {
    api.get<Stats>('/stats/').then(setStats).catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])

  if (!stats) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
  const max = Math.max(1, ...stats.per_member.map((m) => m.total))

  const fin = stats.financial
  const paidOfTotal = fin ? Math.max(0, fin.total_spent - fin.total_paid - fin.total_pending) : 0
  const expenseRows = (stats.invoices ?? []).slice(0, 8).map((inv, i) => ({
    label: inv.title,
    value: inv.total_amount,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }))
  const maxInvoice = Math.max(1, ...expenseRows.map((r) => r.value))
  const memberDueRows = stats.per_member.map((m, i) => ({
    label: m.display_name,
    value: Math.round(m.share_due ?? 0),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }))
  const maxDue = Math.max(1, ...memberDueRows.map((r) => r.value))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">آمار و تاریخچه</h1>
      {fin && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-1">
              <ReceiptText className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
              <CardTitle className="text-xs font-medium text-muted-foreground">جمع کل هزینه‌ها</CardTitle>
            </CardHeader>
            <CardContent><p className="font-display text-lg font-bold">{formatToman(fin.total_spent)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">پرداخت‌شده</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold text-success">{formatToman(fin.total_paid)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">در انتظار تأیید</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold text-warning">{formatToman(fin.total_pending)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">تعداد فاکتورها</CardTitle></CardHeader>
            <CardContent><p className="font-display text-lg font-bold">{faNumber(fin.invoice_count)} فاکتور</p></CardContent>
          </Card>
        </div>
      )}
      {fin && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">وضعیت پرداخت (نمودار دایره‌ای)</CardTitle></CardHeader>
            <CardContent>
              <Donut
                parts={[
                  { label: 'پرداخت‌شده', value: fin.total_paid, color: '#16A34A' },
                  { label: 'در انتظار تأیید', value: fin.total_pending, color: '#CA8A04' },
                  { label: 'پرداخت‌نشده', value: paidOfTotal, color: '#DC2626' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">مبلغ فاکتورهای اخیر (نمودار میله‌ای)</CardTitle></CardHeader>
            <CardContent>
              {expenseRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">فاکتوری ثبت نشده است.</p>
              ) : (
                <Bars rows={expenseRows} max={maxInvoice} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">کار هر نفر (کل تاریخچه)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stats.per_member.map((m) => (
            <div key={m.user} className="flex items-center gap-3">
              <Avatar name={m.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs"><span className="font-semibold">{m.display_name}</span><span className="text-muted-foreground">{fa(m.total)} کار · نظافت {fa(m.cleaning)} · جارو {fa(m.vacuuming)} · آشپزی {fa(m.cooking)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand" style={{ width: `${(m.total / max) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">سهم پرداخت‌نشده‌ی هر نفر (نمودار)</CardTitle></CardHeader>
        <CardContent>
          {memberDueRows.every((r) => r.value === 0) ? (
            <p className="py-4 text-center text-sm text-muted-foreground">همه‌چیز تسویه شده است. ✅</p>
          ) : (
            <Bars rows={memberDueRows} max={maxDue} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">صف‌ها</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          جایگزینی در انتظار: {faNumber(stats.queues.pending_substitutions)} · پرداخت در انتظار: {faNumber(stats.queues.pending_payments)} · هفته‌های ثبت‌شده: {faNumber(stats.history.length)}
        </CardContent>
      </Card>
      {(stats.invoices ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">همه فاکتورها ({faNumber((stats.invoices ?? []).length)})</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(stats.invoices ?? []).map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
                <ReceiptText className="size-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1 text-start">
                  <p className="truncate font-semibold">{inv.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatToman(inv.total_amount)} · پرداخت‌کننده: {inv.payer_name} · {formatJalaliShort(inv.created_at.slice(0, 10))}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
