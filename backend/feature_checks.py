"""End-to-end checks for the draft/publish, notifications, privacy and auth APIs.

Run from the *repository root*:

    python backend/feature_checks.py

It talks to a throwaway scratch database so it never touches your real data.
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

# Windows consoles default to cp1252, which cannot print Persian text.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # pragma: no cover - older Pythons
        pass

BACKEND = Path(__file__).resolve().parent
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

SCRATCH = BACKEND / "feature_check.sqlite3"
if SCRATCH.exists():
    SCRATCH.unlink()
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["DJANGO_SECRET_KEY"] = "feature-check-only"

import django

import config.settings as settings_module

settings_module.DATABASES["default"]["NAME"] = str(SCRATCH)
django.setup()

from django.core.management import call_command  # noqa: E402
from django.test import Client  # noqa: E402

call_command("migrate", run_syncdb=True, verbosity=0)
call_command("seed_room", verbosity=0)

from accounts.models import User  # noqa: E402
from common.jalali import jalali_date, to_jalali  # noqa: E402
from expenses.models import Expense, ExpenseShare  # noqa: E402
from schedule.models import (  # noqa: E402
    Notification,
    ScheduleStatus,
    SiteSettings,
    WeeklySchedule,
    saturday_of,
)

c = Client()
admin = User.objects.get(username="admin")
reza = User.objects.get(username="reza")


def login(username: str) -> dict:
    r = c.post("/api/auth/login/", {"username": username, "password": "room1234"})
    assert r.status_code == 200, r.content
    return {"HTTP_AUTHORIZATION": f"Token {r.json()['token']}"}


AH = login("admin")
H = login("reza")

# 1) SCR-IR Jalali helpers ---------------------------------------------------
assert to_jalali(2026, 10, 12) == (1405, 7, 20), to_jalali(2026, 10, 12)
assert "مهر" in jalali_date(date(2026, 10, 12))
print("1) SCR-IR jalali OK:", jalali_date(date(2026, 10, 12), weekday=True))

# 2) Public branding + settings ----------------------------------------------
r = c.get("/api/site/")
assert r.status_code == 200 and r.json()["site_title"], r.content
print("2a) public site branding OK:", r.json()["site_title"])

r = c.get("/api/settings/", **AH)
assert r.status_code == 200
for key in ("site_title", "bank_name", "card_number", "cooking_days", "cooking_people"):
    assert key in r.json(), key
r = c.put(
    "/api/settings/",
    {
        "cooking_days": [5, 6],
        "cooking_people": 1,
        "site_title": "اتاق ۳۰۱",
        "card_holder": "علی رضایی",
    },
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
assert r.json()["site_title"] == "اتاق ۳۰۱"
r = c.put("/api/settings/", {"cooking_days": [9]}, content_type="application/json", **AH)
assert r.status_code == 400, "invalid cooking days must be rejected"
r = c.put("/api/settings/", {"site_title": "x"}, content_type="application/json", **H)
assert r.status_code == 403, "members must not edit settings"
print("2b) settings (branding/bank/cooking) OK")

# 3) Draft -> free move -> publish -> one smart notification -----------------
week = saturday_of(date.today()) + timedelta(days=7)
WeeklySchedule.objects.filter(week_start=week).delete()
r = c.post(
    "/api/schedule/generate/",
    {"week": week.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code == 201, r.content
draft = WeeklySchedule.objects.get(week_start=week)
assert draft.schedule_status == ScheduleStatus.DRAFT
print("3a) generated as draft OK")

r = c.get(f"/api/schedule/?week={week.isoformat()}", **H)
assert r.json()["exists"] is False and r.json()["schedule_status"] == "draft"
r = c.get(f"/api/schedule/?week={week.isoformat()}", **AH)
assert r.json()["exists"] is True and len(r.json()["assignments"]) > 0
print("3b) draft visibility OK")

a = draft.assignments.first()
busy_that_day = set(
    draft.assignments.filter(date=a.date).values_list('assigned_to_id', flat=True)
)
target = (
    User.objects.filter(is_active=True, is_superuser=False)
    .exclude(pk__in=busy_that_day)
    .first()
)
assert target is not None, 'need one free member to test the move'
r = c.post(
    f"/api/assignments/{a.pk}/move/",
    {"assigned_to": target.pk},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200 and r.json()["assigned_to"] == target.pk, r.content
a.refresh_from_db()
assert a.assigned_to_id == target.pk
r = c.post(
    f"/api/assignments/{a.pk}/move/",
    {"assigned_to": target.pk},
    content_type="application/json",
    **H,
)
assert r.status_code == 403
print("3c) admin free-move in draft OK")

members = User.objects.filter(is_active=True, is_superuser=False).count()
r = c.post(
    "/api/schedule/publish/",
    {"week": week.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
draft.refresh_from_db()
assert draft.schedule_status == ScheduleStatus.PUBLISHED
after = Notification.objects.filter(kind=Notification.Kind.WEEK_SCHEDULE_PUBLISHED).count()
assert after == members, (after, members)

week2 = week + timedelta(days=7)
r = c.post(
    "/api/schedule/generate/",
    {"week": week2.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code == 201, r.content
r = c.post(
    "/api/schedule/publish/",
    {"week": week2.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
after2 = Notification.objects.filter(kind=Notification.Kind.WEEK_SCHEDULE_PUBLISHED).count()
assert after2 == members, (after, after2, members)
r = c.post(
    "/api/schedule/publish/",
    {"week": week.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code == 400, "re-publishing must be rejected"
print("3d) publish + smart single notification OK")

# 4) Notifications API -------------------------------------------------------
r = c.get("/api/notifications/", **H)
assert r.status_code == 200, r.content
payload = r.json()
assert payload["unread_count"] >= 1 and len(payload["items"]) >= 1
assert "created_at_jalali" in payload["items"][0]
r = c.post("/api/notifications/read/", {}, content_type="application/json", **H)
assert r.json()["unread_count"] == 0
r = c.get("/api/notifications/", **H)
assert r.json()["unread_count"] == 0
print("4) notifications list/read OK")

# 5) Expense: payer combo + member share privacy + admin breakdown ----------
r = c.post(
    "/api/expenses/",
    {"title": "خرید برنج", "total_amount": 900000, "payer_name": "سینا"},
    content_type="application/json",
    **AH,
)
assert r.status_code == 201, r.content
assert r.json()["payer_name"] == "سینا"
r = c.post(
    "/api/expenses/",
    {"title": "گاز", "total_amount": 300000},
    content_type="application/json",
    **AH,
)
assert r.json()["payer_name"] == "مدیریت", r.content

r = c.get("/api/expenses/", **H)
mine = [e for e in r.json() if e["title"] == "خرید برنج"][0]
assert len(mine["shares"]) == 1, "a member must see only their own share"
assert mine["shares"][0]["user"] == reza.pk
r = c.get("/api/expenses/", **AH)
theirs = [e for e in r.json() if e["title"] == "خرید برنج"][0]
assert len(theirs["shares"]) > 1, "the admin must see the full breakdown"
print("5) payer combo + member/admin privacy OK")

# 6) Registration + own profile + admin user management ---------------------
r = c.post(
    "/api/auth/register/",
    {"username": "newmate", "password": "strongpass1", "display_name": "هم‌اتاقی جدید"},
)
assert r.status_code == 201, r.content
assert r.json()["user"]["role"] == "member"
H2 = {"HTTP_AUTHORIZATION": "Token " + r.json()["token"]}
r = c.patch(
    "/api/auth/me/",
    {"username": "newmate2", "password": "evenstronger1", "current_password": "strongpass1"},
    content_type="application/json",
    **H2,
)
assert r.status_code == 200, r.content
assert r.json()["username"] == "newmate2"
r = c.patch(
    "/api/auth/me/",
    {"password": "whatever123", "current_password": "wrong"},
    content_type="application/json",
    **H2,
)
assert r.status_code == 400, "wrong current password must be rejected"

newmate = User.objects.get(username="newmate2")
r = c.patch(
    f"/api/members/{newmate.pk}/",
    {"is_active": False},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200 and not User.objects.get(pk=newmate.pk).is_active
r = c.post("/api/auth/login/", {"username": "newmate2", "password": "evenstronger1"})
assert r.status_code == 400, "a locked account must not be able to log in"

# An admin (role=admin) may not lock or demote their own account either.
ali = User.objects.get(username="ali")
HA = login("ali")
r = c.patch(
    f"/api/members/{ali.pk}/",
    {"is_active": False},
    content_type="application/json",
    **HA,
)
assert r.status_code == 403, r.content
r = c.patch(
    f"/api/members/{ali.pk}/",
    {"role": "member"},
    content_type="application/json",
    **HA,
)
assert r.status_code == 403, r.content
print("6) register / own profile / admin user management OK")

# 7) Admin financial statistics ---------------------------------------------
r = c.get("/api/stats/", **AH)
assert r.status_code == 200
stats = r.json()
assert stats["financial"]["total_spent"] >= 1200000
assert len(stats["invoices"]) == Expense.objects.count()
assert any("share_due" in m for m in stats["per_member"])
r = c.get("/api/stats/", **H)
assert r.status_code == 403, "stats are admin-only"
print("7) admin financial stats + invoices OK")

# 8) Payment approval notifies the payer ------------------------------------
share = ExpenseShare.objects.filter(user=reza).exclude(status='paid').first()
assert share is not None
r = c.post(
    f"/api/expenses/shares/{share.pk}/pay/",
    {"card_last4": "1234"},
    content_type="application/json",
    **H,
)
assert r.status_code == 201, r.content
payment_id = r.json()["id"]
r = c.post(f"/api/payments/{payment_id}/approve/", {}, content_type="application/json", **AH)
assert r.status_code == 200, r.content
assert Notification.objects.filter(
    user=reza, kind=Notification.Kind.PAYMENT_APPROVED
).exists(), "approving a payment must notify its owner"
print("8) payment approval notification OK")

# 9) Cooking configuration drives the scheduler -----------------------------
settings_obj = SiteSettings.load()
settings_obj.cooking_days = [3]
settings_obj.cooking_people = 1
settings_obj.save()
from schedule.scheduler import build_slots  # noqa: E402
slots = build_slots(date.today(), settings_obj)
cooking = [s for s in slots if s[2] == "cooking"]
assert len(cooking) == 1 and cooking[0][1] == 3, cooking
settings_obj.cooking_days = [5, 6]
settings_obj.cooking_people = 2
settings_obj.save()
print("9) cooking days/people configuration OK")

from django.db import connections

for _conn in connections.all():
    _conn.close()
try:
    SCRATCH.unlink(missing_ok=True)
except PermissionError:
    pass
print("")
print("ALL FEATURE CHECKS PASSED")
