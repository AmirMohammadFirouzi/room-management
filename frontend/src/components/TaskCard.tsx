import { Check, ChefHat, Clock, Repeat2, Sparkles } from 'lucide-react'
import type { Assignment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatJalali } from '@/lib/jalali'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const TASK_ICONS = {
  cleaning: Sparkles,
  vacuuming: Clock,
  cooking: ChefHat,
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

/** One assignment row: task icon, Jalali date, assignee, status, actions. */
export function TaskCard({
  assignment,
  showAssignee = true,
  canConfirm = false,
  onConfirm,
  onSubstitute,
  confirming = false,
}: TaskCardProps) {
  const Icon = TASK_ICONS[assignment.task_type]
  const done = assignment.status === 'confirmed'

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-control border-line border-border bg-card px-3.5 py-3',
        done && 'opacity-70',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-control bg-secondary',
          TASK_TONES[assignment.task_type],
        )}
      >
        <Icon className="size-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{assignment.task_label}</span>
          {assignment.weekday_label && (
            <Badge variant="outline">{assignment.weekday_label}</Badge>
          )}
          {assignment.is_substituted && (
            <Badge variant="warning">
              <Repeat2 className="ms-1 size-3" /> جایگزینی
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
        </p>
      </div>

      {done ? (
        <Badge variant="success">
          <Check className="ms-1 size-3" /> انجام شد
        </Badge>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          {canConfirm && onConfirm && (
            <Button
              size="sm"
              variant="success"
              disabled={confirming}
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
