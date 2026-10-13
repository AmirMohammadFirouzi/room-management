/**
 * Jalali (Persian) date utilities.
 *
 * The conversion algorithm comes from the official SCR-IR library
 * (https://github.com/SCR-IR/Jalali-Date-for-All-Programming-Languages,
 * vendored at ./scr-jalali.js) — it is imported and used only, never
 * re-implemented here. Everything else (labels, formatting, Persian digits)
 * is presentation logic.
 */

import { gregorian_to_jalali, jalali_to_gregorian } from './scr-jalali'

export const WEEKDAY_LABELS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const

export const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const

export interface JalaliDate {
  jy: number
  jm: number
  jd: number
}

/** Gregorian → Jalali: returns [jy, jm, jd] (via SCR-IR). */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  return gregorian_to_jalali(gy, gm, gd)
}

/** Jalali → Gregorian: returns [gy, gm, gd] (via SCR-IR). */
export function toGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  return jalali_to_gregorian(jy, jm, jd)
}

/** Parse an ISO date string (YYYY-MM-DD) into a JS Date at local midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** JS Date → [jy, jm, jd] (via SCR-IR). */
export function dateToJalali(date: Date): [number, number, number] {
  return toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** JS Date → { jy, jm, jd } (via SCR-IR). */
export function dateToJalaliObj(date: Date): JalaliDate {
  const [jy, jm, jd] = dateToJalali(date)
  return { jy, jm, jd }
}

/** { jy, jm, jd } → JS Date (via SCR-IR). */
export function jalaliToDate(j: JalaliDate): Date {
  const [gy, gm, gd] = toGregorian(j.jy, j.jm, j.jd)
  return new Date(gy, gm - 1, gd)
}

/** Jalali → ISO string (YYYY-MM-DD) (via SCR-IR). */
export function jalaliToISO(j: JalaliDate): string {
  return toISO(jalaliToDate(j))
}

/** ISO string (YYYY-MM-DD) → Jalali { jy, jm, jd } (via SCR-IR). */
export function isoToJalali(iso: string): JalaliDate {
  return dateToJalaliObj(parseISO(iso))
}

/** Days in a Jalali month, derived from the SCR-IR conversion. */
export function jalaliDaysInMonth(jy: number, jm: number): number {
  const start = jalaliToDate({ jy, jm, jd: 1 })
  const next = jm === 12 ? { jy: jy + 1, jm: 1, jd: 1 } : { jy, jm: jm + 1, jd: 1 }
  const end = jalaliToDate(next)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

/** Persian digits for a number/string. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** 1234567 → ۱٬۲۳۴٬۵۶۷ */
export function faNumber(value: number | string): string {
  return toFaDigits(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}

/** Format an ISO date as a full Jalali date: «شنبه ۲۰ مهر ۱۴۰۵» */
export function formatJalali(iso: string, withWeekday = true): string {
  const d = parseISO(iso)
  const [jy, jm, jd] = dateToJalali(d)
  const weekday = WEEKDAY_LABELS[persianWeekday(d)]
  const date = `${toFaDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`
  return withWeekday ? `${weekday} ${date}` : date
}

/** Short form: «۲۰ مهر ۱۴۰۵» */
export function formatJalaliShort(iso: string): string {
  return formatJalali(iso, false)
}

/** Persian weekday index of a JS Date: 0 = شنبه ... 6 = جمعه */
export function persianWeekday(date: Date): number {
  return (date.getDay() + 2) % 7
}

/** The Saturday (as Date) of the week containing d. */
export function saturdayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - persianWeekday(d))
  return d
}

/** ISO string (YYYY-MM-DD) of a Date. */
export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today as ISO string. */
export function todayISO(): string {
  return toISO(new Date())
}

/** Add n days to an ISO string, return ISO. */
export function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Month name from Jalali month number (1-12). */
export function jalaliMonthName(jm: number): string {
  return PERSIAN_MONTHS[jm - 1]
}
