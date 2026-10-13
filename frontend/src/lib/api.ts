/** Thin fetch-based API client. Token auth; JSON in/out. */

const TOKEN_KEY = 'room_token'
const SESSION_TOKEN_KEY = 'room_token_session'

/** Online deployment: set VITE_API_URL (e.g. https://api.example.com). Local dev uses the Vite proxy. */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(SESSION_TOKEN_KEY)
}

/**
 * Store the auth token. «مرا به خاطر بسپار» → localStorage (persistent);
 * otherwise sessionStorage (gone when the tab closes).
 */
export function setToken(token: string | null, remember = true) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
    return
  }
  if (remember) {
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = getToken()
  if (token) headers.Authorization = `Token ${token}`

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers })

  if (res.status === 401) {
    setToken(null)
    if (!path.startsWith('/auth/login')) {
      window.location.href = '/login'
    }
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { detail: text }
    }
  }

  if (!res.ok) {
    const obj = data as Record<string, unknown> | null
    let message = 'خطایی رخ داد.'
    if (obj) {
      if (typeof obj.detail === 'string') message = obj.detail
      else {
        // DRF field errors: {field: [messages]}
        const first = Object.entries(obj).find(([, v]) => v)
        if (first) {
          const [, v] = first
          message = Array.isArray(v) ? String(v[0]) : String(v)
        }
      }
    }
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
