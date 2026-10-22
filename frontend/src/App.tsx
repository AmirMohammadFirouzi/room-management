import { Navigate, Route, Routes } from 'react-router-dom'
import * as React from 'react'
import { useAuth } from './auth'
import { fetchServerTime } from './lib/serverTime'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { SchedulePage } from './pages/Schedule'
import { SubstitutionsPage } from './pages/Substitutions'
import { ExpensesPage } from './pages/Expenses'
import { WalletPage } from './pages/Wallet'
import { ProfilePage } from './pages/Profile'
import { MembersAdminPage } from './pages/admin/Members'
import { SettingsAdminPage } from './pages/admin/Settings'
import { ApprovalsAdminPage } from './pages/admin/Approvals'
import { ScheduleAdminPage } from './pages/admin/ScheduleAdmin'
import { StatsAdminPage } from './pages/admin/Stats'
import { AnnounceAdminPage } from './pages/admin/Announce'

export default function App() {
  const { user, loading } = useAuth()

  // Start fetching the server's clock once; every date in the UI is derived
  // from it (never the browser clock), so kick it off as early as possible.
  React.useEffect(() => {
    void fetchServerTime()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        در حال بارگذاری…
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/substitutions" element={<SubstitutionsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        {user.is_admin && (
          <>
            <Route path="/admin/members" element={<MembersAdminPage />} />
            <Route path="/admin/settings" element={<SettingsAdminPage />} />
            <Route path="/admin/approvals" element={<ApprovalsAdminPage />} />
            <Route path="/admin/schedule" element={<ScheduleAdminPage />} />
            <Route path="/admin/stats" element={<StatsAdminPage />} />
            <Route path="/admin/announce" element={<AnnounceAdminPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
