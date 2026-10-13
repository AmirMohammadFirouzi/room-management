import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuth } from '@/auth'
import { api } from '@/lib/api'
import type { SiteBranding } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/** صفحه‌ی ورود: عنوان/لوگوی قابل ویرایش توسط مدیر، «مرا به خاطر بسپار»، ثبت‌نام. */
export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [brand, setBrand] = React.useState<SiteBranding | null>(null)
  const [mode, setMode] = React.useState<'login' | 'register'>('login')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [remember, setRemember] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    api
      .get<SiteBranding>('/site/')
      .then(setBrand)
      .catch(() => undefined)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(username.trim(), password, remember)
      } else {
        await register(username.trim(), password, displayName.trim() || username.trim())
        toast({ title: 'خوش آمدی! حسابت ساخته شد', variant: 'success' })
      }
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطایی رخ داد.'
      setError(message)
      toast({ title: mode === 'login' ? 'ورود ناموفق' : 'ثبت‌نام ناموفق', description: message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const title = brand?.site_title ?? 'خوش آمدید'
  const logo = brand?.site_logo || ''

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4 py-8">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl text-brand-foreground shadow-surface">
            {logo ? <span aria-hidden>{logo}</span> : <ShieldCheck className="size-7" />}
          </span>
          <CardTitle className="font-display text-lg">{title}</CardTitle>
          <CardDescription>
            {mode === 'login' ? 'خوش آمدید' : 'عضو جدید اتاق هستی؟ ثبت‌نام کن'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="نام کاربری" htmlFor="username">
              <Input
                id="username"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </Field>
            {mode === 'register' && (
              <Field label="نام نمایشی" htmlFor="display-name">
                <Input
                  id="display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثلا: سینا خانی"
                  required
                />
              </Field>
            )}
            <Field label={mode === 'login' ? 'رمز عبور' : 'رمز عبور (حداقل ۸ کاراکتر)'} htmlFor="password">
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                error={error || undefined}
              />
            </Field>
            {mode === 'login' && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 accent-current"
                />
                مرا به خاطر بسپار
              </label>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? '…' : mode === 'login' ? (
                <span className="inline-flex items-center gap-2"><LogIn className="size-4" /> ورود</span>
              ) : (
                <span className="inline-flex items-center gap-2"><UserPlus className="size-4" /> ثبت‌نام</span>
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
              className="text-center text-sm text-brand hover:underline"
            >
              {mode === 'login' ? 'حساب نداری؟ ثبت‌نام کن' : 'حساب داری؟ ورود'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
