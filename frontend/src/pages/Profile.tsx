import * as React from 'react'
import { useAuth } from '@/auth'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { usernameError } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'

const PALETTE = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0891B2',
  '#4F46E5',
  '#9333EA',
]

/** پروفایل من: ویرایش نام کاربری، نام نمایشی، رمز عبور و آواتار. */
export function ProfilePage() {
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const [username, setUsername] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [avatarColor, setAvatarColor] = React.useState('')
  const [avatarText, setAvatarText] = React.useState('')
  const [avatarImage, setAvatarImage] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    setUsername(user?.username ?? '')
    setDisplayName(user?.display_name ?? '')
    setAvatarColor(user?.avatar_color ?? '')
    setAvatarText(user?.avatar_text ?? '')
    setAvatarImage(user?.avatar_image ?? '')
  }, [user])

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 512 * 1024) {
      toast({ title: 'حجم تصویر حداکثر ۵۱۲ کیلوبایت باشد', variant: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarImage(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (username.trim() !== user?.username) {
      const bad = usernameError(username)
      if (bad) {
        toast({ title: 'خطا', description: bad, variant: 'error' })
        return
      }
    }
    setBusy(true)
    try {
      const body: Record<string, string> = {}
      if (username.trim() !== user?.username) body.username = username.trim()
      if (displayName.trim() !== user?.display_name) body.display_name = displayName.trim()
      if (avatarColor !== (user?.avatar_color ?? '')) body.avatar_color = avatarColor
      if (avatarText.trim() !== (user?.avatar_text ?? '')) body.avatar_text = avatarText.trim()
      if (avatarImage !== (user?.avatar_image ?? '')) body.avatar_image = avatarImage
      if (next) {
        body.password = next
        body.current_password = current
      }
      await api.patch('/auth/me/', body)
      await refresh()
      setCurrent('')
      setNext('')
      toast({ title: 'پروفایل ذخیره شد', variant: 'success' })
    } catch (err) {
      toast({ title: 'خطا', description: err instanceof Error ? err.message : 'خطایی رخ داد.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">پروفایل من</h1>
      <Card>
        <CardHeader className="items-center pb-2 text-center">
          <Avatar
            name={displayName || user?.display_name || ''}
            src={avatarImage || undefined}
            color={avatarColor || user?.avatar_bg || undefined}
            size="lg"
          />
          <CardTitle className="text-sm">{user?.display_name}</CardTitle>
          <p className="text-xs text-muted-foreground">آواتار پیش‌فرض شما همین است؛ می‌توانید تغییرش دهید</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-3">
            <Field label="نام کاربری" htmlFor="p-u" hint="فقط حروف انگلیسی (A–Z)، اعداد و . + - _ @">
              <Input id="p-u" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required error={usernameError(username) ?? undefined} />
            </Field>
            <Field label="نام نمایشی" htmlFor="p-d">
              <Input id="p-d" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>
            <Field label="حرف آواتار (خالی = خودکار)" htmlFor="p-a">
              <Input id="p-a" value={avatarText} maxLength={10} onChange={(e) => setAvatarText(e.target.value)} placeholder={user?.avatar_text} />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">رنگ آواتار</p>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setAvatarColor(c)}
                    className="size-8 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: avatarColor === c ? '2px solid currentColor' : undefined,
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setAvatarColor('')}
                  className="rounded-control border border-border px-2.5 py-1 text-xs text-muted-foreground"
                >
                  خودکار
                </button>
              </div>
            </div>
            <Field label="تصویر آواتار (اختیاری، حداکثر ۵۱۲KB)" htmlFor="p-img">
              <input
                id="p-img"
                type="file"
                accept="image/*"
                onChange={onImage}
                className="text-sm text-muted-foreground"
              />
            </Field>
            {avatarImage && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarImage('')}>
                حذف تصویر و برگشت به حرف
              </Button>
            )}
            <Field label="رمز عبور فعلی (فقط برای تغییر رمز)" htmlFor="p-c">
              <Input id="p-c" dir="ltr" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="رمز عبور جدید (حداقل ۸ کاراکتر)" htmlFor="p-n">
              <Input id="p-n" dir="ltr" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? '…' : 'ذخیره'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
