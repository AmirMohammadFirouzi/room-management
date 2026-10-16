import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './auth'
import { ThemeProvider } from './theme'
import { ToastProvider } from './components/ui/toast'
import { DashboardProvider } from './hooks/useDashboard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <DashboardProvider>
            <ToastProvider position="bottom-end">
              <App />
            </ToastProvider>
          </DashboardProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
