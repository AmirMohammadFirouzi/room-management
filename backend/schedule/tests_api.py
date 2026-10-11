"""API smoke test — run with: manage.py shell --command "from schedule import tests_api" """

from datetime import date

from django.test import Client

from accounts.models import User
from schedule.models import Assignment, SiteSettings, saturday_of

c = Client()

# --- login ---
r = c.post("/api/auth/login/", {"username": "reza", "password": "room1234"})
assert r.status_code == 200, r.content
token = r.json()["token"]
H = {"HTTP_AUTHORIZATION": f"Token {token}"}

r = c.get("/api/auth/me/", **H)
assert r.status_code == 200 and r.json()["username"] == "reza"
print("login/me OK")

# --- dashboard ---
r = c.get("/api/dashboard/", **H)
assert r.status_code == 200, r.content
d = r.json()
assert "today" in d and "my_week" in d and "balance" in d and "pending" in d
print("dashboard OK, week_start:", d["week_start"])

# --- schedule ---
r = c.get("/api/schedule/", **H)
assert r.status_code == 200 and r.json()["exists"] is True
print("schedule OK,", len(r.json()["assignments"]), "assignments")

# --- settings read ---
r = c.get("/api/settings/", **H)
assert r.status_code == 200
print("settings read OK:", r.json()["vacuum_days"], r.json()["vacuum_people"])

# --- member cannot write settings ---
r = c.put("/api/settings/", {"vacuum_people": 3}, content_type="application/json", **H)
assert r.status_code == 403
print("settings write protected OK")

# --- confirm a task as the assigned person ---
my = Assignment.objects.filter(
    assigned_to__username="reza", status="pending"
).first() or Assignment.objects.filter(status="pending").first()
if my is None:
    print("confirm already done (nothing pending)")
else:
    r = c.post(f"/api/assignments/{my.pk}/confirm/", **H)
    assert r.status_code == 200, r.content
    assert r.json()["status"] == "confirmed"
    print("confirm OK")

# --- substitution flow: reza asks ali(?) no — pick someone free that day ---
target = Assignment.objects.filter(
    assigned_to__username="reza", status="pending"
).first()
if target is None:
    target = Assignment.objects.filter(status="pending").first()
# candidates
r = c.get(f"/api/assignments/{target.pk}/candidates/", **H)
assert r.status_code == 200, r.content
cands = r.json()
assert cands and all(c["user"] != target.assigned_to_id for c in cands)
print("candidates OK:", len(cands))

# create substitution as admin for the assignee
admin_tok = c.post(
    "/api/auth/login/", {"username": "admin", "password": "room1234"}
).json()["token"]
AH = {"HTTP_AUTHORIZATION": f"Token {admin_tok}"}
existing = None
from schedule.models import SubstitutionRequest

existing = SubstitutionRequest.objects.filter(
    assignment=target, status="pending"
).first()
if existing:
    sub_id = existing.id
    print("substitution already pending:", sub_id)
else:
    r = c.post(
        "/api/substitutions/",
        {"assignment": target.pk, "replacement": cands[0]["user"], "reason": "کار دارم"},
        content_type="application/json",
        **AH,
    )
    assert r.status_code == 201, r.content
    sub_id = r.json()["id"]
    print("substitution created:", sub_id)

# approve (idempotent-ish: only if still pending)
if SubstitutionRequest.objects.filter(pk=sub_id, status="pending").exists():
    r = c.post(f"/api/substitutions/{sub_id}/approve/", **AH)
    assert r.status_code == 200, r.content
    assert r.json()["credit_action"] == "created"
    print("substitution approved, credit created")
else:
    print("substitution already decided")

# credits ledger for the original (debtor)
r = c.get("/api/credits/", **H)
assert r.status_code == 200
credits = r.json()
assert "i_owe" in credits and "owed_to_me" in credits
print("credits OK: i_owe =", len(credits["i_owe"]))

# --- expenses ---
r = c.get("/api/expenses/", **H)
assert r.status_code == 200 and len(r.json()) >= 1
expense = r.json()[0]
my_shares = [
    s
    for s in expense["shares"]
    if s["user"] in User.objects.filter(username="reza").values_list("id", flat=True)
]
unpaid = [s for s in my_shares if s["status"] == "unpaid"]
if unpaid:
    share = unpaid[0]
    r = c.post(
        f"/api/expenses/shares/{share['id']}/pay/",
        {"card_last4": "9876"},
        content_type="application/json",
        **H,
    )
    assert r.status_code == 201, r.content
    pay_id = r.json()["id"]
    print("payment submitted:", pay_id)

    # admin approves
    r = c.post(f"/api/payments/{pay_id}/approve/", **AH)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    print("payment approved OK")
else:
    print("all shares already settled")

# balance
r = c.get("/api/expenses/balance/", **H)
assert r.status_code == 200
print("balance OK: unpaid =", r.json()["unpaid_total"])

# --- admin generate schedule for a unique probe week (repeatable) ---
from datetime import timedelta as _td

from schedule.models import WeeklySchedule as _WS

probe = date.today() + _td(days=70)
probe = probe + _td(days=(5 - probe.weekday()) % 7)  # next Saturday
while _WS.objects.filter(week_start=probe).exists():
    probe = probe + _td(days=7)  # keep probing until a fresh week is found
r = c.post(
    "/api/schedule/generate/",
    {"week": probe.isoformat()},
    content_type="application/json",
    **AH,
)
if r.status_code == 400:
    r = c.post(
        "/api/schedule/generate/",
        {"week": probe.isoformat(), "replace": True},
        content_type="application/json",
        **AH,
    )
assert r.status_code == 201, r.content
print("generate week OK:", r.json()["week_start"])

# --- stats ---
r = c.get("/api/stats/", **AH)
assert r.status_code == 200 and len(r.json()["per_member"]) == 8
print("stats OK: total =", sum(m["total"] for m in r.json()["per_member"]))

# member blocked from stats
r = c.get("/api/stats/", **H)
assert r.status_code == 403
print("stats protected OK")

# --- member management (admin only) ---
r = c.post(
    "/api/members/",
    {
        "username": "newbie",
        "password": "strongpass123",
        "display_name": "عضو جدید",
        "role": "member",
    },
    content_type="application/json",
    **AH,
)
assert r.status_code == 201, r.content
uid = r.json()["id"]
r = c.delete(f"/api/members/{uid}/", **AH)
assert r.status_code == 204
print("member CRUD OK")

# admin settings write
r = c.put(
    "/api/settings/",
    {"vacuum_days": [2, 4], "vacuum_people": 2},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
assert r.json()["vacuum_days"] == [2, 4]
print("admin settings write OK")

# Leave the room as we found it: restore the default vacuum config.
r = c.put(
    "/api/settings/",
    {"vacuum_days": [2, 4, 6], "vacuum_people": 2},
    content_type="application/json",
    **AH,
)
assert r.status_code == 200, r.content
assert r.json()["vacuum_days"] == [2, 4, 6]
print("settings restored to defaults")

print("\nALL API SMOKE TESTS PASSED")
