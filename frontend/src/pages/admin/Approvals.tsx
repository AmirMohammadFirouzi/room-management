import * as React from 'react'
import { api } from '@/lib/api'
import type { Payment, SubstitutionRequest } from '@/lib/types'
import { formatJalali } from '@/lib/jalali'
import { formatToman } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ApprovalsAdminPage() {
  const { toast } = useToast()
  const [subs, setSubs] = React.useState<SubstitutionRequest[]>([])
  const [pays, setPays] = React.useState<Payment[]>([])
  const [busy, setBusy] = React.useState<number | null>(null)

  const load = React.useCallback(() => {
    Promise.all([api.get<SubstitutionRequest[]>('/substitutions/'), api.get<Payment[]>('/payments/pending/')])
      .then(([s, p]) => { setSubs(s.filter((x) => x.status === 'pending')); setPays(p) })
      .catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])
  React.useEffect(() => { load() }, [load])

  async function decideSub(id: number, action: 'approve' | 'reject') {
    setBusy(id)
    try {
      const r = await api.post<SubstitutionRequest>(`/substitutions/${id}/${action}/`, {})
      toast({ title: action === 'approve' ? `تأیید شد${'credit_action' in r && (r as {credit_action:string}).credit_action === 'settled' ? ' و اعتبار تسویه شد' : ''}` : 'رد شد', variant: 'success' })
      load()
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(null) }
  }

  async function decidePay(id: number, action: 'approve' | 'reject') {
    setBusy(-id)
    try {
      await api.post(`/payments/${id}/${action}/`, {})
      toast({ title: action === 'approve' ? 'پرداخت تأیید شد' : 'پرداخت رد شد', variant: 'success' })
      load()
    } catch (e) { toast({ title: 'خطا', description: (e as Error).message, variant: 'error' }) }
    finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">صف تأییدها</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">جایگزینی‌ها ({subs.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {subs.length === 0 && <p className="text-sm text-muted-foreground">موردی نیست.</p>}
          {subs.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-control border border-border p-3 text-sm">
              <p><b>{r.replacement_name}</b> جای <b>{r.requested_by_name}</b> · {r.assignment_detail?.task_label} · {r.assignment_detail && formatJalali(r.assignment_detail.date)}</p>
              {r.reason && <p className="text-xs text-muted-foreground">دلیل: {r.reason}</p>}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => void decideSub(r.id, 'approve')}>تأیید</Button>
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void decideSub(r.id, 'reject')}>رد</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">پرداخت‌ها ({pays.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pays.length === 0 && <p className="text-sm text-muted-foreground">موردی نیست.</p>}
          {pays.map((p) => (
            <div key={p.id} className="flex flex-col gap-1 rounded-control border border-border p-3 text-sm">
              <p>{p.submitted_by_name} · {formatToman(p.amount)} · <span dir="ltr">···· {p.card_last4}</span></p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === -p.id} onClick={() => void decidePay(p.id, 'approve')}>تأیید</Button>
                <Button size="sm" variant="outline" disabled={busy === -p.id} onClick={() => void decidePay(p.id, 'reject')}>رد</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {subs.length + pays.length > 0 && <Badge variant="warning">{subs.length + pays.length} در انتظار</Badge>}
    </div>
  )
}
