import { Check, Repeat2 } from 'lucide-react'
import type { Assignment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatJalali, todayISO } from '@/lib/jalali'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'

/** Minimal task-type glyphs: one neutral stroke icon per task, no 3D clutter. */
export const TASK_GLYPHS = {
  cleaning: 'نظافت',
  vacuuming: 'جاروبرقی',
  cooking: 'آشپزی',
} as const

const TASK_TONES = {
  cleaning: 'text-brand',
  vacuuming: 'text-success',
  cooking: 'text-warning',
} as const

export interface TaskCardProps {
  assignment: Assignment
  /** Show the assignee (week view); hide for "my task" cards. */
  showAssignee?: boolean
  /** Whether the current user may confirm this assignment. */
  canConfirm?: boolean
  onConfirm?: (id: number) => void
  onSubstitute?: (id: number) => void
  confirming?: boolean
}

/**
 * One assignment row: minimal glyph, Jalali date, assignee, status, actions.
 * The «تأیید انجام» button stays disabled until the exact day of the task
 * (backend enforces the same rule; admins bypass it).
 */
export function TaskCard({
  assignment,
  showAssignee = true,
  canConfirm = false,
  onConfirm,
  onSubstitute,
  confirming = false,
}: TaskCardProps) {
  const done = assignment.status === 'confirmed'
  const isToday = assignment.date === todayISO()
  const confirmLocked = canConfirm && !isToday

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-control border-line border-border bg-card px-3.5 py-3',
        done && 'opacity-70',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-control bg-secondary text-sm font-bold',
          TASK_TONES[assignment.task_type],
        )}
        aria-hidden
      >
        {assignment.task_label.slice(0, 1)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{assignment.task_label}</span>
          {assignment.weekday_label && (
            <Badge variant="outline">{assignment.weekday_label}</Badge>
          )}
          {assignment.is_substituted && (
            <Badge variant="warning">
              <Repeat2 className="ms-1 size-3" strokeWidth={1.75} /> جایگزینی
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {showAssignee && <>{assignment.assignee_name} · </>}
          {assignment.original_assignee_name && (
            <>مسئول اولیه: {assignment.original_assignee_name} · </>
          )}
          {formatJalali(assignment.date)}
          {done && ' · تأیید شد'}
          {!done && confirmLocked && ' · فقط در روز تکلیف فعال می‌شود'}
        </p>
      </div>

      <Avatar
        name={assignment.assignee_name}
        src={assignment.assignee_image || undefined}
        color={assignment.assignee_color || undefined}
        size="sm"
        className="hidden sm:inline-flex"
      />

      {done ? (
        <Badge variant="success">
          <Check className="ms-1 size-3" strokeWidth={1.75} /> انجام شد
        </Badge>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          {canConfirm && onConfirm && (
            <Button
              size="sm"
              variant="success"
              disabled={confirming || confirmLocked}
              title={confirmLocked ? 'دکمه‌ی تأیید فقط در روز خودِ تکلیف فعال می‌شود' : 'تأیید انجام'}
              onClick={() => onConfirm(assignment.id)}
            >
              تأیید انجام
            </Button>
          )}
          {canConfirm && onSubstitute && (
            <Button size="sm" variant="outline" onClick={() => onSubstitute(assignment.id)}>
              جایگزینی
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
