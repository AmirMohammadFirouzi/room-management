import * as React from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { fa } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'

export function MembersAdminPage() {
  const { toast } = useToast()
  const [members, setMembers] = React.useState<User[]>([])
  const [form, setForm] = React.useState({ username: '', password: '', display_name: '', role: 'member' })
  const [editing, setEditing] = React.useState<User | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<User[]>('/members/').then(setMembers).catch((e: Error) => toast({ title: 'خطا', description: e.message, variant: 'error' }))
  }, [toast])
  React.useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/members/', { ...form, username: form.username.trim() })
      toast({ title: 'عضو اضافه شد', variant: 'success' })
      setForm({ username: '', password: '', display_name: '', role: 'member' })
      load()
    } catch (err) { toast({ title: 'خطا', description: (err as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      await api.patch(`/members/${editing.id}/`, { display_name: editing.display_name, role: editing.role, is_active: editing.is_active })
      toast({ title: 'ذخیره شد', variant: 'success' })
      setEditing(null); load()
    } catch (err) { toast({ title: 'خطا', description: (err as Error).message, variant: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold">اعضا <Badge variant="brand">{fa(members.length)} نفر</Badge></h1>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="size-4 text-brand" /> افزودن هم‌اتاقی</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <Field label="نام کاربری" htmlFor="m-u"><Input id="m-u" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label="نام نمایشی" htmlFor="m-d"><Input id="m-d" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required /></Field>
            <Field label="رمز عبور" htmlFor="m-p"><Input id="m-p" dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
            <Field label="نقش" htmlFor="m-r">
              <select id="m-r" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-10 rounded-field border border-input bg-field px-3 text-sm">
                <option value="member">عضو</option><option value="admin">مدیر</option>
              </select>
            </Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? '…' : 'افزودن'}</Button></div>
          </form>
        </CardContent>
      </Card>
      {members.map((m) => (
        <Card key={m.id} className={!m.is_active ? 'opacity-60' : ''}>
          <CardContent className="flex items-center gap-3 py-3">
            <Avatar name={m.display_name} size="sm" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{m.display_name}</p><p className="text-xs text-muted-foreground" dir="ltr">@{m.username}</p></div>
            <Badge variant={m.role === 'admin' ? 'brand' : 'outline'}>{m.role === 'admin' ? 'مدیر' : 'عضو'}</Badge>
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...m })}>ویرایش</Button>
            <Button size="sm" variant="ghost" aria-label="حذف" onClick={() => { if (window.confirm('حذف شود؟')) api.delete(`/members/${m.id}/`).then(load) }}><Trash2 className="size-4 text-destructive" /></Button>
          </CardContent>
        </Card>
      ))}
      {editing && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-overlay border border-border bg-popover p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">ویرایش {editing.display_name}</h2>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="نام نمایشی" htmlFor="e-d"><Input id="e-d" value={editing.display_name} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} /></Field>
              <Field label="نقش" htmlFor="e-r">
                <select id="e-r" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as 'admin' | 'member' })} className="h-10 rounded-field border border-input bg-field px-3 text-sm">
                  <option value="member">عضو</option><option value="admin">مدیر</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="size-4" /> فعال</label>
              <div className="flex gap-2"><Button onClick={save} disabled={busy}>ذخیره</Button><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
