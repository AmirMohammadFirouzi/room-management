import * as React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  LogOut,
  Menu,
  Moon,
  ArrowLeftRight,
  Bell,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Wallet,
  Megaphone,
  BarChart3,
  X,
} from 'lucide-react'
import { cn, fa } from '@/lib/utils'
import { useAuth } from '@/auth'
import { useTheme } from '@/theme'
import { useDashboard } from '@/hooks/useDashboard'
import { useNotifications } from '@/hooks/useNotifications'
import { api } from '@/lib/api'
import type { SiteBranding } from '@/lib/types'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  admin?: boolean
}
/** App shell: top bar on desktop, bottom tab bar + «بیشتر» drawer on mobile. */
export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { data } = useDashboard()
  const { unread } = useNotifications()
  const navigate = useNavigate()
  const [brand, setBrand] = React.useState<SiteBranding | null>(null)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [adminOpen, setAdminOpen] = React.useState(false)
  const adminWrapRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!adminOpen) return
    function onDocClick(e: MouseEvent) {
      if (adminWrapRef.current && !adminWrapRef.current.contains(e.target as Node)) {
        setAdminOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [adminOpen])

  React.useEffect(() => {
    api.get<SiteBranding>('/site/').then(setBrand).catch(() => undefined)
  }, [])

  const pendingSubs = data?.pending.substitutions ?? 0
  const adminPending =
    (data?.pending.pending_substitutions ?? 0) + (data?.pending.pending_payments ?? 0)
  const totalBadge = unread + pendingSubs + (user?.is_admin ? adminPending : 0)

  const items: NavItem[] = [
    { to: '/', label: 'داشبورد', icon: LayoutGrid },
    { to: '/schedule', label: 'برنامه', icon: CalendarDays },
    { to: '/substitutions', label: 'جایگزینی', icon: ArrowLeftRight, badge: pendingSubs },
    { to: '/expenses', label: 'هزینه‌ها', icon: Wallet },
    { to: '/wallet', label: 'کیف پول', icon: Wallet },
  ]
  const adminItems: NavItem[] = [
    { to: '/admin/approvals', label: 'تأییدها', icon: CheckCheck, badge: adminPending, admin: true },
    { to: '/admin/schedule', label: 'ساخت برنامه', icon: CalendarPlus, admin: true },
    { to: '/admin/members', label: 'اعضا', icon: Users, admin: true },
    { to: '/admin/settings', label: 'تنظیمات', icon: Settings, admin: true },
    { to: '/admin/stats', label: 'آمار', icon: BarChart3, admin: true },
    { to: '/admin/announce', label: 'اطلاعیه', icon: Megaphone, admin: true },
  ]
  const allItems = [...items, ...(user?.is_admin ? adminItems : [])]
  const title = brand?.site_title ?? 'اتاق مشترک'
  const logo = brand?.site_logo || ''

  const mobileTabs: (NavItem | { more: true })[] = user?.is_admin
    ? [
        items[0],
        items[1],
        items[3],
        { to: '/admin/approvals', label: 'تأییدها', icon: CheckCheck, badge: adminPending },
        { more: true } as { more: true },
      ]
    : [items[0], items[1], items[3], items[4], { more: true } as { more: true }]

  function NavBadge({ n }: { n?: number }) {
    if (!n) return null
    return (
      <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
        {fa(n)}
      </span>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col overflow-x-hidden">
      {/* Desktop top navbar only — mobile uses the bottom tab bar. */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur md:block">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-start"
            onClick={() => navigate('/')}
            aria-label={title}
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand text-lg text-brand-foreground">
              {brand?.site_logo_image ? (
                <img src={brand.site_logo_image} alt={title} className="size-full object-cover" />
              ) : logo ? (
                <span aria-hidden>{logo}</span>
              ) : (
                <ShieldCheck className="size-4" />
              )}
            </span>
            <span className="truncate font-display text-sm font-bold">{title}</span>
          </button>
          <nav className="hidden min-w-0 items-center gap-1 lg:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-secondary font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
                <NavBadge n={item.badge} />
              </NavLink>
            ))}
            {user?.is_admin && (
              <div ref={adminWrapRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAdminOpen((o) => !o)}
                  aria-expanded={adminOpen}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-control px-3 py-1.5 text-sm transition-colors',
                    adminOpen
                      ? 'bg-secondary font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Settings className="size-4" />
                  مدیریت
                  <NavBadge n={adminPending} />
                </button>
                {adminOpen && (
                  <div className="absolute end-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-overlay border border-border bg-popover p-1.5 shadow-overlay">
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setAdminOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors',
                            isActive
                              ? 'bg-secondary font-semibold text-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )
                        }
                      >
                        <item.icon className="size-4 text-brand" />
                        <span className="flex-1 text-start">{item.label}</span>
                        <NavBadge n={item.badge} />
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/profile')}
              aria-label="پروفایل"
              title="پروفایل من"
            >
              <Avatar
                name={user?.display_name ?? ''}
                src={user?.avatar_image || undefined}
                color={user?.avatar_bg || undefined}
                size="sm"
              />
            </Button>
            <span className="hidden max-w-28 truncate text-sm xl:inline">{user?.display_name}</span>
            {totalBadge > 0 && (
              <span
                className="inline-flex min-w-5 items-center justify-center gap-0.5 rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 text-brand-foreground"
                title={`${fa(totalBadge)} مورد در انتظار`}
              >
                <Bell className="size-3" strokeWidth={1.75} />
                {fa(totalBadge)}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="تم">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { void logout().then(() => navigate('/login')) }} aria-label="خروج">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 pb-28 md:pb-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 text-center md:mx-0 md:max-w-none md:text-start">
          <Outlet />
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((tab, i) => {
            if ('more' in tab) {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className="relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] text-muted-foreground"
                >
                  <span className="relative">
                    <Menu className="size-5" />
                    {totalBadge > 0 && (
                      <span className="absolute -top-1 -start-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
                        {fa(totalBadge)}
                      </span>
                    )}
                  </span>
                  بیشتر
                </button>
              )
            }
            return (
              <NavLink
                key={`${tab.to}-${i}`}
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors',
                    isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                <span className="relative">
                  <tab.icon className="size-5" />
                  {tab.badge ? (
                    <span className="absolute -top-1 -start-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
                      {fa(tab.badge)}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </NavLink>
            )
          })}
        </div>
      </nav>
      {moreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="flex max-h-[80dvh] w-full max-w-md flex-col gap-1 overflow-y-auto rounded-overlay border border-border bg-popover p-4 shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-bold">همه بخش‌ها</p>
              <Button variant="ghost" size="icon" onClick={() => setMoreOpen(false)} aria-label="بستن">
                <X className="size-4" />
              </Button>
            </div>
            {allItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm hover:bg-accent"
              >
                <item.icon className="size-4 text-brand" />
                <span className="flex-1 text-start">{item.label}</span>
                {item.badge ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 text-brand-foreground">
                    {fa(item.badge)}
                  </span>
                ) : null}
              </NavLink>
            ))}
            <NavLink
              to="/profile"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm hover:bg-accent"
            >
              <UserRound className="size-4 text-brand" />
              <span className="flex-1 text-start">پروفایل من</span>
            </NavLink>
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm hover:bg-accent"
            >
              {theme === 'dark' ? (
                <Sun className="size-4 text-brand" />
              ) : (
                <Moon className="size-4 text-brand" />
              )}
              <span className="flex-1 text-start">{theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                void logout().then(() => navigate('/login'))
              }}
              className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="size-4" />
              <span className="flex-1 text-start">خروج</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

