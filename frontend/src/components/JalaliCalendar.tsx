import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  WEEKDAY_SHORT,
  dateToJalaliObj,
  isoToJalali,
  jalaliDaysInMonth,
  jalaliMonthName,
  jalaliToISO,
  type JalaliDate,
} from '@/lib/jalali'
import { cn, fa } from '@/lib/utils'

export interface JalaliCalendarProps {
  /** Currently selected date (Jalali), or null. */
  value: JalaliDate | null
  onChange: (d: JalaliDate) => void
  /** Only allow picking dates on/after today. */
  minToday?: boolean
  /** Extra predicate: dates returning true are disabled. */
  isDisabled?: (d: JalaliDate) => boolean
  className?: string
}

function sameDay(a: JalaliDate | null, b: JalaliDate): boolean {
  return !!a && a.jy === b.jy && a.jm === b.jm && a.jd === b.jd
}

function shiftMonth(view: { jy: number; jm: number }, delta: number) {
  let { jy, jm } = view
  jm += delta
  while (jm < 1) {
    jm += 12
    jy -= 1
  }
  while (jm > 12) {
    jm -= 12
    jy += 1
  }
  return { jy, jm }
}

/** یک تقویم شمسی قابل استفاده‌ی مجدد (ماه/سال، امروز، انتخاب، غیرفعال). */
export function JalaliCalendar({
  value,
  onChange,
  minToday = false,
  isDisabled,
  className,
}: JalaliCalendarProps) {
  const today = React.useMemo(() => dateToJalaliObj(new Date()), [])
  const [view, setView] = React.useState(() => {
    const base = value ?? today
    return { jy: base.jy, jm: base.jm }
  })

  React.useEffect(() => {
    if (value) setView({ jy: value.jy, jm: value.jm })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.jy, value?.jm])

  const daysInMonth = jalaliDaysInMonth(view.jy, view.jm)
  // Persian weekday index (0=شنبه) of the 1st of the viewed month.
  const firstWeekday =
    (new Date(jalaliToISO({ jy: view.jy, jm: view.jm, jd: 1 })).getDay() + 2) % 7

  function disabled(d: JalaliDate): boolean {
    if (minToday && jalaliToISO(d) < jalaliToISO(today)) return true
    return isDisabled?.(d) ?? false
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="ماه قبل"
          onClick={() => setView((v) => shiftMonth(v, -1))}
          className="flex size-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
        <p className="text-sm font-bold">
          {jalaliMonthName(view.jm)}{' '}
          <span className="text-muted-foreground">{fa(view.jy)}</span>
        </p>
        <button
          type="button"
          aria-label="ماه بعد"
          onClick={() => setView((v) => shiftMonth(v, 1))}
          className="flex size-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_SHORT.map((w, i) => (
          <div
            key={i}
            className={cn(
              'py-1 text-[11px] font-semibold text-muted-foreground',
              i === 6 && 'text-warning',
            )}
          >
            {w}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day: JalaliDate = { jy: view.jy, jm: view.jm, jd: i + 1 }
          const off = disabled(day)
          const isToday = sameDay(today, day)
          const isSel = sameDay(value, day)
          return (
            <button
              key={day.jd}
              type="button"
              disabled={off}
              onClick={() => onChange(day)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-control text-sm transition-colors',
                isSel
                  ? 'bg-brand font-bold text-brand-foreground shadow-control'
                  : isToday
                    ? 'border-line border-brand font-bold text-brand'
                    : 'text-foreground hover:bg-accent',
                off && 'cursor-not-allowed opacity-30 hover:bg-transparent',
              )}
            >
              {fa(day.jd)}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          setView({ jy: today.jy, jm: today.jm })
          onChange(today)
        }}
        className="self-center rounded-control px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-accent"
      >
        برو به امروز ({fa(today.jd)} {jalaliMonthName(today.jm)})
      </button>
    </div>
  )
}


/** A date-picker field backed by JalaliCalendar (ISO value, Jalali display). */
export function JalaliDateField({
  value,
  onChange,
  minToday = false,
  isDisabled,
  label,
  className,
}: {
  value: string // ISO YYYY-MM-DD
  onChange: (iso: string) => void
  minToday?: boolean
  isDisabled?: (d: JalaliDate) => boolean
  label?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = React.useMemo(() => {
    try {
      return isoToJalali(value)
    } catch {
      return null
    }
  }, [value])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label ?? 'انتخاب تاریخ'}
        className="rounded-field border-line-field border-input bg-field px-3 text-start text-sm shadow-field transition-colors hover:border-ring/60"
      >
        <span className="block h-10 truncate leading-10">
          {selected
            ? `${fa(selected.jd)} ${jalaliMonthName(selected.jm)} ${fa(selected.jy)}`
            : 'انتخاب تاریخ…'}
        </span>
      </button>
      {open && (
        <div className="rounded-surface border-line border-border bg-card p-3 shadow-surface">
          <JalaliCalendar
            value={selected}
            minToday={minToday}
            isDisabled={isDisabled}
            onChange={(d) => {
              onChange(jalaliToISO(d))
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
