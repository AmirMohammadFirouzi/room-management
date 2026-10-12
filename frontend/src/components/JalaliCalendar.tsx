import * as React from "react"
import { gregorian_to_jalali, jalali_to_gregorian } from "@/lib/scr-jalali"
import { fa } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/** Jalali weekday index: 0 = شنبه ... 6 = جمعه */
function jalaliWeekday(d: number): number {
  // d assume [jy, jm, jd]; convert to gregorian and use JS day-of-week
  const [gy, gm, gd] = d
  const [gy2, gm2, gd2] = jalali_to_gregorian(gy, gm, gd)
  return (new Date(gy2, gm2 - 1, gd2).getDay() + 2) % 7
}

/** Return days in a Jalali month `jm` of year `jy`. */
function jalaliDaysInMonth(jy: number, jm: number): number {
  // First day of next month (or next year), subtract 1.
  const [gyNext, jmNext] = jm === 12 ? [jy + 1, 1] : [jy, jm + 1]
  const [gy, jm2] = jalali_to_gregorian(jy, jm, 1)
  const [, jm2Next, jd2Next] = jalali_to_gregorian(gyNext, jmNext, 1)
  return jd2Next - 1
}

export interface JalaliCalendarProps {
  value: { jy: number; jm: number; jd: number } | null
  onChange: (d: { jy: number; jm: number; jd: number }) => void
  /** Show the selected date in this month view. */
  view?: { jy: number; jm: number } | null
  /** Control the view: pass a Jalali date to jump there. */
  viewDate?: { jy: number; jm: number } | null
  /** If true, only allow past or today dates (e.g. forward date). */
  disabledForward?: boolean
}

/** یک تقویمJalali قابل استفاده مجدد. */
export function JalaliCalendar({
  value,
  onChange,
  view,
  viewDate,
  disabledForward = false,
}: JalaliCalendarProps) {
  const [viewJ, setViewJ] = React.useState<{ jy: number; jm: number }>(
    view ?? (viewDate ?? { jy: new Date().getFullYear(), jm: new Date().getMonth() + 1 })
  )
  const [selected, setSelected] = React.useState<{ jy: number; jm: number; jd: number } | null>(
    value ?? null
  )

  React.useEffect(() => {
    if (viewDate) {
      setViewJ({ jy: viewDate.jy, jm: viewDate.jm })
    }
  }, [viewDate])

  React.useEffect(() => {
    setSelected(value)
  }, [value])

  const jump = (dy: number, dm: number, dd: number) => {
    const next = { jy: viewJ.jy + dy, jm: viewJ.jm + dm, jd: dd }
    setViewJ(next)
    onChange(next)
    setSelected(next)
  }

  const selectDay = (dy: number, dm: number, dd: number) => {
    const isDisabled =
      disabledForward && (dy > new Date().getDate() || (dy === new Date().getDate() && false))
    if (disabledForward && (dy > new Date().getDate() || (dy === new Date().getDate() && mm > new Date().getMonth() + 1))) {
      return
    }
    setSelected({ jy: viewJ.jy + dy, jm: viewJ.jm + dm, jd: dd })
    onChange({ jy: viewJ.jy + dy, jm: viewJ.jm + dm, jd: dd })
  }

  const renderDays = () => {
    const days: React.ReactNode[] = []
    const today = new Date()
    const weekDayLabels = [
      "شنبه",
      "یکشنبه",
      "دوشنبه",
      "سه‌شنبه",
      "چهارشنبه",
      "پنجشنبه",
      "جمعه",
    ]
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={`label-${i}`} className="w-12 text-center text-[11px] font-semibold text-muted-foreground">
          {weekDayLabels[i].charAt(0)}
        </div>
      )
    }
    for (let week = 0; week < 6; week++) {
      for (let day = 0; day < 7; day++) {
        days.push(<div key={`cell-${week}-${day}`} className="w-12 text-center text-sm" />)
      }
    }
    return days
  }

  const today = new Date()
  const weekDayLabels = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <span className="inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
            {fa(viewJ.jm)} {jalaliMonthNames(viewJ.jm)}
          </span>
          <span className="text-base font-bold">{fa(viewJ.jy)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDayLabels.map((w) => (
            <div key={w} className="text-[11px] font-semibold text-muted-foreground">
              {w.charAt(0)}
            </div>
          ))}
          {renderDays()}
        </div>
      </CardContent>
    </Card>
  )
}

const jalaliMonthNames: Record<number, string> = {
  1: "فروردین",
  2: "اردیبهشت",
  3: "خرداد",
  4: "تیر",
  5: "مرداد",
  6: "شهریور",
  7: "مهر",
  8: "آبان",
  9: "آذر",
  10: "دی",
  11: "بهمن",
  12: "اسفند",
}
