import * as React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Home,
  LogOut,
  Moon,
  Repeat2,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  BarChart3,
  CheckCheck,
  CalendarPlus,
} from 'lucide-react'
import { cn, fa } from '@/lib/utils'
import { useAuth } from '@/auth'
import { useTheme } from '@/theme'
import { useDashboard } from '@/hooks/useDashboard'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  admin?: boolean
}

/** App shell: top bar on desktop, bottom tab bar on mobile (thumb-friendly). */
export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { data } = useDashboard()
  const navigate = useNavigate()

  const pendingSubs = data?.pending.substitutions ?? 0
  const adminPending =
    (data?.pending.pending_substitutions ?? 0) + (data?.pending.pending_payments ?? 0)

  const items: NavItem[] = [
    { to: '/', label: 'داشبورد', icon: Home },
    { to: '/schedule', label: 'برنامه', icon: CalendarDays },
    { to: '/substitutions', label: 'جایگزینی', icon: Repeat2, badge: pendingSubs },
    { to: '/expenses', label: 'هزینه‌ها', icon: Wallet },
  ]
  const adminItems: NavItem[] = [
    { to: '/admin/approvals', label: 'تأییدها', icon: CheckCheck, badge: adminPending, admin: true },
    { to: '/admin/schedule', label: 'ساخت برنامه', icon: CalendarPlus, admin: true },
    { to: '/admin/members', label: 'اعضا', icon: Users, admin: true },
    { to: '/admin/settings', label: 'تنظیمات', icon: Settings, admin: true },
    { to: '/admin/stats', label: 'آمار', icon: BarChart3, admin: true },
  ]

  const mobileItems = user?.is_admin
    ? [items[0], items[1], items[3], adminItems[0]]
    : items

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-line border-border bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex flex-1 items-center gap-2">
            <ShieldCheck className="size-5 text-brand" />
            <span className="font-display text-sm font-bold">اتاق مشترک</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {[...items, ...(user?.is_admin ? adminItems : [])].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-secondary font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
                {item.badge ? (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                    {fa(item.badge)}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <div className="hidden items-center gap-2 md:flex">
              <Avatar name={user?.display_name ?? ''} size="sm" />
              <span className="max-w-28 truncate text-sm">{user?.display_name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void logout().then(() => navigate('/login'))
              }}
              aria-label="خروج"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-5 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-line border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {mobileItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors',
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )
              }
            >
              <span className="relative">
                <item.icon className="size-5" />
                {item.badge ? (
                  <span className="absolute -top-1 -start-1.5 inline-flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                    {fa(item.badge)}
                  </span>
                ) : null}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
