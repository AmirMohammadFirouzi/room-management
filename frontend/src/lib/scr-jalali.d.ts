/**
 * Type declarations for the vendored SCR-IR Jalali converter
 * (https://github.com/SCR-IR/jalaliDate-JavaScript, src/converter.js).
 * The library is imported and used only — never re-implemented.
 */

/** Gregorian (gy, gm, gd) → Jalali [jy, jm, jd] */
export declare function gregorian_to_jalali(
  gy: number,
  gm: number,
  gd: number,
): [number, number, number]

/** Jalali (jy, jm, jd) → Gregorian [gy, gm, gd] */
export declare function jalali_to_gregorian(
  jy: number,
  jm: number,
  jd: number,
): [number, number, number]
