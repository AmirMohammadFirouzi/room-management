"""Jalali (شمسی) date formatting built on the official SCR-IR library.

The conversion algorithm lives in :mod:`common.jalali_scr`, which is a
*verbatim* copy of https://github.com/SCR-IR/Jalali-Date-for-All-Programming-Languages
(``jalaliDate-Python``). This module only **imports and uses** it — the
algorithm is never re-implemented here.
"""

from __future__ import annotations

from datetime import date, datetime

from .jalali_scr import gregorian_to_jalali, jalali_to_gregorian

__all__ = [
    "MONTHS",
    "WEEKDAYS",
    "to_jalali",
    "to_gregorian",
    "jalali_date",
    "jalali_datetime",
    "jalali_weekday",
    "days_in_jalali_month",
    "fa_digits",
]

MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
]

# شنبه = 0 ... جمعه = 6 (Persian week starts on Saturday).
WEEKDAYS = [
    "شنبه",
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
]

_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa_digits(value) -> str:
    """Latin digits → Persian digits: 1405 → ۱۴۰۵."""
    return str(value).translate(_FA)


def to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    """Gregorian → Jalali via the SCR-IR library."""
    jy, jm, jd = gregorian_to_jalali(gy, gm, gd)
    return int(jy), int(jm), int(jd)


def to_gregorian(jy: int, jm: int, jd: int) -> tuple[int, int, int]:
    """Jalali → Gregorian via the SCR-IR library."""
    gy, gm, gd = jalali_to_gregorian(jy, jm, jd)
    return int(gy), int(gm), int(gd)


def jalali_date(value: date | datetime, weekday: bool = False) -> str:
    """``2026-10-12`` → «۱۲ مهر ۱۴۰۵» (optionally prefixed with the weekday)."""
    if isinstance(value, datetime):
        value = value.date()
    jy, jm, jd = to_jalali(value.year, value.month, value.day)
    text = f"{fa_digits(jd)} {MONTHS[jm - 1]} {fa_digits(jy)}"
    if weekday:
        text = f"{jalali_weekday(value)} {text}"
    return text


def jalali_datetime(value: datetime) -> str:
    """Full timestamp: «شنبه ۱۲ مهر ۱۴۰۵ — ۱۸:۳۰»."""
    jy, jm, jd = to_jalali(value.year, value.month, value.day)
    text = f"{fa_digits(jd)} {MONTHS[jm - 1]} {fa_digits(jy)}"
    return f"{jalali_weekday(value.date())} {text} — {fa_digits(value.strftime('%H:%M'))}"


def jalali_weekday(value: date) -> str:
    """Persian weekday name of a Gregorian date (شنبه ... جمعه)."""
    return WEEKDAYS[(value.weekday() + 2) % 7]


def days_in_jalali_month(jy: int, jm: int) -> int:
    """Length of a Jalali month, derived from the SCR-IR conversion:
    the gap between the 1st of this month and the 1st of the next one."""
    if jm == 12:
        ny, nm, _ = to_jalali(jy + 1, 1, 1)
    else:
        ny, nm, _ = to_jalali(jy, jm + 1, 1)
    next_year, next_month, _ = to_gregorian(ny, nm, 1)
    this_year, this_month, _ = to_gregorian(jy, jm, 1)
    return (date(next_year, next_month, 1) - date(this_year, this_month, 1)).days
