/**
 * Jalali (Persian) date utilities — dependency-free.
 * Algorithm: the well-known jalaali-js (MIT) Julian-Day-based conversion,
 * accurate for the modern era (breakpoints table through year 3178).
 */

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

// Jalaali year breakpoints for leap-year arithmetic.
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
]

function div(a: number, b: number): number {
  return Math.trunc(a / b)
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b
}

/** Gregorian date → Julian Day Number. */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

/** Julian Day Number → Gregorian date. */
function d2g(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return [gy, gm, gd]
}

/** Jalaali calendar arithmetic for year jy. */
function jalCal(jy: number): { gy: number; march: number; leap: number } {
  const bl = BREAKS.length
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0
  let n = 0
  let i = 1

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new Error(`Invalid Jalaali year ${jy}`)
  }
  for (i = 1; i < bl; i += 1) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  n = jy - jp

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { gy, march, leap }
}

/** Julian Day Number → Jalali date. */
function d2j(jdn: number): [number, number, number] {
  const gy = d2g(jdn)[0]
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  let jm: number
  let jd: number

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31)
      jd = mod(k, 31) + 1
      return [jy, jm, jd]
    }
    k -= 186
  } else {
    // Before Farvardin 1: the date belongs to the previous Jalaali year.
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  jm = 7 + div(k, 30)
  jd = mod(k, 30) + 1
  return [jy, jm, jd]
}

/** Jalali date → Julian Day Number. */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

/** Gregorian → Jalali: returns [jy, jm, jd]. */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  return d2j(g2d(gy, gm, gd))
}

/** Jalali → Gregorian: returns [gy, gm, gd]. */
export function toGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  return d2g(j2d(jy, jm, jd))
}

/** Parse an ISO date string (YYYY-MM-DD) into a JS Date at local midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** JS Date → [jy, jm, jd] */
export function dateToJalali(date: Date): [number, number, number] {
  return toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Persian digits for a number/string. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** 1234567 → ۱٬۲۳۴٬۵۶۷ */
export function faNumber(value: number | string): string {
  return toFaDigits(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}

/** Format an ISO date as a full Jalali date: «شنبه ۱۵ مهر ۱۴۰۵» */
export function formatJalali(iso: string, withWeekday = true): string {
  const d = parseISO(iso)
  const [jy, jm, jd] = dateToJalali(d)
  const weekday = WEEKDAY_LABELS[persianWeekday(d)]
  const date = `${toFaDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`
  return withWeekday ? `${weekday} ${date}` : date
}

/** Short form: «۱۵ مهر ۱۴۰۵» */
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
