/** Shared API types mirroring the Django REST serializers. */

export interface User {
  id: number
  username: string
  display_name: string
  avatar_text: string
  role: 'admin' | 'member'
  is_admin: boolean
  is_active: boolean
}

export type TaskType = 'cleaning' | 'vacuuming' | 'cooking'

export const TASK_LABELS: Record<TaskType, string> = {
  cleaning: 'نظافت',
  vacuuming: 'جاروبرقی',
  cooking: 'آشپزی',
}

export type AssignmentStatus = 'pending' | 'confirmed'

export interface Assignment {
  id: number
  schedule: number
  date: string
  weekday: number
  weekday_label: string
  task_type: TaskType
  task_label: string
  assigned_to: number
  assignee_name: string
  assignee_avatar: string
  original_assignee: number | null
  original_assignee_name: string | null
  /** True when someone replaced the original assignee (derived client-side). */
  is_substituted?: boolean
  status: AssignmentStatus
  confirmed_at: string | null
}

export interface WeeklySchedule {
  id: number
  week_start: string
  created_at: string
  created_by: number
  assignments: Assignment[]
  exists?: boolean
}

export interface SiteSettings {
  vacuum_days: number[]
  vacuum_people: number
  cleaning_enabled: boolean
  vacuuming_enabled: boolean
  cooking_enabled: boolean
}

export interface SubstitutionRequest {
  id: number
  assignment: number
  assignment_detail: Assignment
  requested_by: number
  requested_by_name: string
  replacement: number
  replacement_name: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
  decided_by: number | null
  decided_by_name: string | null
  reject_reason: string
}

export interface Candidate {
  user: number
  display_name: string
  avatar_text: string
  owes_favor: boolean
  total_tasks: number
}

export interface Credit {
  id: number
  debtor: number
  debtor_name: string
  creditor: number
  creditor_name: string
  created_at: string
  settled_at: string | null
}

export type ShareStatus = 'unpaid' | 'pending' | 'paid' | 'rejected'

export interface Payment {
  id: number
  share: number
  amount: number
  card_last4: string
  submitted_by: number
  submitted_by_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
  decided_by: number | null
  decided_by_name: string | null
  reject_reason: string
}

export interface ExpenseShare {
  id: number
  expense: number
  user: number
  user_name: string
  amount: number
  status: ShareStatus
  payment: Payment | null
}

export interface Expense {
  id: number
  title: string
  total_amount: number
  note: string
  created_by: number
  created_by_name: string
  created_at: string
  shares: ExpenseShare[]
}

export interface Balance {
  owed_total: number
  paid_total: number
  pending_total: number
  rejected_total: number
  unpaid_total: number
  others_owed_to_me: number
}

export interface DashboardData {
  today: Assignment[]
  my_week: Assignment[]
  week_start: string
  balance: {
    owed_total: number
    paid_total: number
    unpaid_total: number
  }
  pending: {
    substitutions: number
    payments: number
    unconfirmed: number
    pending_substitutions?: number
    pending_payments?: number
  }
  schedule_exists: boolean
}

export interface MemberStats {
  user: number
  display_name: string
  avatar_text: string
  cleaning: number
  vacuuming: number
  cooking: number
  total: number
  confirmed: number
}

export interface Stats {
  per_member: MemberStats[]
  history: WeeklySchedule[]
  queues: {
    pending_substitutions: number
    pending_payments: number
  }
}
