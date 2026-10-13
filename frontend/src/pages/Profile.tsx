import * as React from 'react'
import { useAuth } from '@/auth'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'

/** پروفایل من: ویرایش نام کاربری، نام نمایشی و رمز عبور. */
export function ProfilePage() {
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const [username, setUsername] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    setUsername(user?.username ?? '')
    setDisplayName(user?.display_name ?? '')
  }, [user])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body: Record<string, string> = {}
      if (username.trim() !== user?.username) body.username = username.trim()
      if (displayName.trim() !== user?.display_name) body.display_name = displayName.trim()
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
          <Avatar name={user?.display_name ?? ''} size="lg" />
          <CardTitle className="text-sm">{user?.display_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-3">
            <Field label="نام کاربری" htmlFor="p-u">
              <Input id="p-u" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="نام نمایشی" htmlFor="p-d">
              <Input id="p-d" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>
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
