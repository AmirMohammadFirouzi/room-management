import * as React from 'react'
import { Megaphone, Send } from 'lucide-react'
import { api } from '@/lib/api'
import type { AnnouncementResult, User } from '@/lib/types'
import { fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/input'

/**
 * اطلاعیه‌ی مدیر: broadcast public message to everyone, or selective
 * message to chosen users (each recipient gets their own inbox row).
 */
export function AnnounceAdminPage() {
  const { toast } = useToast()
  const [members, setMembers] = React.useState<User[]>([])
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [audience, setAudience] = React.useState<'public' | 'selective'>('public')
  const [selected, setSelected] = React.useState<number[]>([])
  const [busy, setBusy] = React.useState(false)
  const [lastSent, setLastSent] = React.useState<number | null>(null)

  React.useEffect(() => {
    api.get<User[]>('/members/').then(setMembers).catch(() => undefined)
  }, [])

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = message.trim()
    if (!text) {
      toast({ title: 'متن اطلاعیه را بنویسید', variant: 'error' })
      return
    }
    if (audience === 'selective' && selected.length === 0) {
      toast({ title: 'حداقل یک عضو را انتخاب کنید', variant: 'error' })
      return
    }
    if (title.length > 60) {
      toast({ title: 'عنوان اعلان نباید بیشتر از ۶۰ نویسه باشد', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const out = await api.post<AnnouncementResult>('/announcements/', {
        title,
        description,
        message: text,
        ...(audience === 'selective' ? { user_ids: selected } : {}),
      })
      setLastSent(out.sent)
      setTitle('')
      setDescription('')
      setMessage('')
      toast({ title: `اطلاعیه برای ${fa(out.sent)} نفر ارسال شد`, variant: 'success' })
    } catch (err) {
      toast({ title: 'خطا', description: (err as Error).message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    active
      ? 'rounded-control border border-brand bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground'
      : 'rounded-control border border-border px-3 py-1.5 text-sm text-muted-foreground'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">اطلاعیه و پیام همگانی</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-brand" strokeWidth={1.75} />
            ارسال اطلاعیه
            {lastSent !== null && <Badge variant="success">{fa(lastSent)} ارسال‌شده</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="flex flex-col gap-3">
            <Field label="عنوان اعلان (حداکثر ۶۰ نویسه)" htmlFor="ann-title">
              <input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                placeholder="مثلا: اعلان جامع اتاق"
                className="w-full rounded-field border border-input bg-field px-3 py-2 text-sm"
              />
            </Field>

            <Field label="توضیح/توضیحات مختصر (حداکثر ۲۸۰ نویسه)" htmlFor="ann-desc">
              <textarea
                id="ann-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder="متن مختصر که به عنوان توضیح اعلان در جلد نمایش داده می‌شود"
                className="w-full rounded-field border border-input bg-field px-3 py-2 text-sm"
              />
            </Field>

            <Field label="متن پیام (حداکثر ۴۰۰ نویسه)" htmlFor="ann-msg">
              <textarea
                id="ann-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={400}
                rows={3}
                placeholder="مثلا: جلسه‌ی اتاق امشب ساعت ۹"
                className="w-full rounded-field border border-input bg-field px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">گیرندگان</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setAudience('public')} className={chip(audience === 'public')}>
                  همه‌ی اعضا (عمومی)
                </button>
                <button type="button" onClick={() => setAudience('selective')} className={chip(audience === 'selective')}>
                  اعضای انتخاب‌شده
                </button>
              </div>
            </div>

            {audience === 'selective' && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={chip(selected.includes(m.id))}
                  >
                    <Avatar name={m.display_name} size="sm" src={m.avatar_image || undefined} color={m.avatar_bg || undefined} />
                    {m.display_name}
                  </button>
                ))}
                {members.length === 0 && <p className="text-xs text-muted-foreground">عضوی پیدا نشد.</p>}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busy}>
                <Send className="size-4" strokeWidth={1.75} />
                {busy ? '…' : 'ارسال اطلاعیه'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {audience === 'public' ? 'به همه‌ی اعضا می‌رسد.' : `${fa(selected.length)} عضو انتخاب شده است.`}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">اعلان‌های خودکار سامانه</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <p>• انتشار برنامه‌ی هفتگی → اعلان برای همه‌ی اعضا</p>
          <p>• عضو جدید (ثبت‌نام یا ساخت توسط مدیر) → پیام خوش‌آمد در صندوق پیام او</p>
          <p>• هزینه‌ی جدید → اعلان برای اعضای انتخاب‌شده در تقسیم (یا همه)</p>
          <p>• همین صفحه → اطلاعیه‌ی دستی عمومی یا گزینشی</p>
        </CardContent>
      </Card>
    </div>
  )
}

