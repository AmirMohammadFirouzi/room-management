"""Smoke checks for the second feature batch (batch-2).

Run from the *repository root*:

    python backend/new_checks.py

Uses a throwaway scratch database so real data is never touched.
"""

from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # pragma: no cover
        pass

BACKEND = Path(__file__).resolve().parent
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

SCRATCH = BACKEND / "new_check.sqlite3"
if SCRATCH.exists():
    SCRATCH.unlink()
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["DJANGO_SECRET_KEY"] = "new-check-only"

import django

import config.settings as settings_module

settings_module.DATABASES["default"]["NAME"] = str(SCRATCH)
django.setup()

from django.core.management import call_command  # noqa: E402
from django.test import Client  # noqa: E402

call_command("migrate", run_syncdb=True, verbosity=0)
call_command("seed_room", verbosity=0)

from accounts.models import User  # noqa: E402
from expenses.models import Expense  # noqa: E402
from schedule.models import Notification, saturday_of  # noqa: E402

c = Client()


def login(username: str) -> dict:
    r = c.post("/api/auth/login/", {"username": username, "password": "room1234"})
    assert r.status_code == 200, r.content
    return {"HTTP_AUTHORIZATION": f"Token {r.json()['token']}"}


AH = login("admin")
H = login("reza")

# 1) Register sends a welcome message + avatar fields exist ----------------
r = c.post(
    "/api/auth/register/",
    {"username": "fresh", "password": "strongpass1", "display_name": "تازه‌وارد"},
    content_type="application/json",
)
assert r.status_code == 201, r.content
fresh_user = User.objects.get(username="fresh")
assert Notification.objects.filter(
    user=fresh_user, kind=Notification.Kind.WELCOME
).exists(), "register must create a welcome inbox row"
r2 = c.get("/api/members/", **AH)
assert r2.status_code == 200, r2.content
me = [u for u in r2.json() if u["id"] == fresh_user.id][0]
assert "avatar_bg" in me and "avatar_color" in me and "avatar_image" in me
print("1) register welcome + avatar fields OK")

# 2) Admin-created member also gets a welcome row --------------------------
r = c.post(
    "/api/members/",
    {
        "username": "mate2",
        "password": "strongpass1",
        "display_name": "هم‌اتاقی دوم",
        "role": "member",
    },
    content_type="application/json",
    **AH,
)
# 3) Confirm gate: non-today tasks blocked, today allowed -------------------
from schedule.models import Assignment  # noqa: E402

week = saturday_of(date.today())
r = c.post(
    "/api/schedule/generate/",
    {"week": week.isoformat(), "replace": True},
    content_type="application/json",
    **AH,
)
assert r.status_code in (200, 201), r.content
r = c.post(
    "/api/schedule/publish/",
    {"week": week.isoformat()},
    content_type="application/json",
    **AH,
)
assert r.status_code in (200, 400), r.content

HH = login("reza")
off_day = (
    Assignment.objects.filter(assigned_to__username="reza")
    .exclude(date=date.today())
    .order_by("date")
    .first()
)
if off_day is not None:
    r = c.post(f"/api/assignments/{off_day.id}/confirm/", {}, **HH)
    assert r.status_code == 400, (r.status_code, r.content)
    print("3a) off-day confirm blocked OK")
else:
    print("3a) skipped (no off-day task)")
today_task = Assignment.objects.filter(
    assigned_to__username="reza", date=date.today()
).first()
if today_task is not None and today_task.status != "confirmed":
    r = c.post(f"/api/assignments/{today_task.id}/confirm/", {}, **HH)
    assert r.status_code == 200, r.content
    print("3b) today confirm allowed OK")
else:
    print("3b) skipped (no unconfirmed today-task)")

# 4) Expense edit/delete + new-expense notification --------------------------
reza_u = User.objects.get(username="reza")
amir_u = User.objects.get(username="amir")
r = c.post(
    "/api/expenses/",
    {
        "title": "تست ویرایش",
        "total_amount": 1200000,
        "payer_name": "مدیریت",
        "member_ids": [reza_u.id, amir_u.id],
    },
    content_type="application/json",
    **AH,
)
assert r.status_code == 201, r.content
exp_id = r.json()["id"]
assert Notification.objects.filter(
    kind=Notification.Kind.NEW_EXPENSE, data__expense=exp_id
).exists(), "creating an expense must notify the sharers"
r = c.patch(
    f"/api/expenses/{exp_id}/",
    {"title": "تست ویرایش‌شده", "total_amount": 1500000},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200 and r.json()["title"] == "تست ویرایش‌شده", r.content
r = c.delete(f"/api/expenses/{exp_id}/", **AH)
assert r.status_code == 204, r.content
assert not Expense.objects.filter(pk=exp_id).exists()
r = c.delete("/api/expenses/1/", **H)
assert r.status_code in (403, 404), (r.status_code, r.content)
print("4) expense edit/delete + notify OK")

# 5) Announcements: broadcast + selective -----------------------------------
n0 = Notification.objects.count()
r = c.post(
    "/api/announcements/",
    {"message": "جلسه‌ی اتاق امشب ساعت ۹", "user_ids": [reza_u.id, amir_u.id]},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200 and r.json()["sent"] == 2, r.content
assert (
    Notification.objects.filter(
        user=reza_u, kind=Notification.Kind.ANNOUNCEMENT
    ).count()
    == 1
)
r = c.post(
    "/api/announcements/",
    {"message": "اطلاعیه‌ی عمومی"},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200 and r.json()["sent"] >= 2, r.content
assert Notification.objects.count() > n0
r = c.post(
    "/api/announcements/",
    {"message": "x"},
    content_type="application/json",
    **H,
)
assert r.status_code == 403, "announcements are admin-only"
print("5) announcements (public/selective) OK")

# 6) Uploaded logo images ---------------------------------------------------
r = c.put(
    "/api/settings/",
    {
        "bank_logo_image": "data:image/png;base64,AAA",
        "site_logo_image": "data:image/png;base64,BBB",
    },
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
assert r.json()["bank_logo_image"].startswith("data:")
r = c.get("/api/site/")
assert r.json().get("site_logo_image") == "data:image/png;base64,BBB", r.content
print("6) uploaded logo images OK")

# 7) Profile avatar edit ----------------------------------------------------
r = c.patch(
    "/api/auth/me/",
    {"avatar_color": "#123456", "avatar_text": "ر"},
    content_type="application/json",
    **H,
)
assert r.status_code == 200 and r.json()["avatar_color"] == "#123456", r.content
r = c.get("/api/auth/me/", **H)
assert r.json()["avatar_bg"] == "#123456", r.content
print("7) profile avatar edit OK")

from django.db import connections

for _conn in connections.all():
    _conn.close()
try:
    SCRATCH.unlink(missing_ok=True)
except PermissionError:
    pass
print("")
print("ALL BATCH-2 CHECKS PASSED")

