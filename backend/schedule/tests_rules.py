"""Quick validation of the scheduling hard rules (run via `manage.py shell`)."""

from collections import Counter, defaultdict
from datetime import date, timedelta

from accounts.models import User
from schedule.models import Assignment, SiteSettings, WeeklySchedule, persian_weekday, saturday_of
from schedule.scheduler import generate_schedule

# Hermetic: reset to the default config so the check is repeatable even after
# the API smoke test (which temporarily changes the vacuum days).
SITE_DEFAULTS = {
    "vacuum_days": [2, 4, 6],  # Monday, Wednesday, Friday (Saturday = 0)
    "vacuum_people": 2,
    "cleaning_enabled": True,
    "vacuuming_enabled": True,
    "cooking_enabled": True,
}
_settings = SiteSettings.load()
for _key, _value in SITE_DEFAULTS.items():
    setattr(_settings, _key, _value)
_settings.save()

week_start = saturday_of(date.today())
ws = WeeklySchedule.objects.filter(week_start=week_start).first()
if ws is not None:
    _vac_by_day = Counter(
        a.weekday for a in ws.assignments.all() if a.task_type == "vacuuming"
    )
    _matches_defaults = all(_vac_by_day.get(wd, 0) == 2 for wd in (2, 4, 6))
    if not _matches_defaults and not ws.assignments.filter(
        status="confirmed"
    ).exists():
        # Stale schedule from a different config — rebuild it under defaults.
        ws.delete()
        ws = None
if ws is None:
    _admin = User.objects.filter(is_superuser=False).first()
    assert _admin, "seed the room first (python manage.py seed_room)"
    ws = generate_schedule(week_start, _admin)

assignments = list(ws.assignments.all())
settings_ok = True

# Rule 1: cleaning — one person per day, no repeats within the week.
cleaning = [a for a in assignments if a.task_type == "cleaning"]
days = [a.date for a in cleaning]
people = [a.assigned_to_id for a in cleaning]
assert len(cleaning) == 7, f"expected 7 cleaning slots, got {len(cleaning)}"
assert len(set(days)) == 7, "cleaning must cover 7 distinct days"
assert len(set(people)) == len(people), "NO person may clean twice in one week"

# Rule 2: one task per person per day.
per_day = defaultdict(set)
for a in assignments:
    assert a.assigned_to_id not in per_day[a.date], (
        f"{a.assigned_to} has two tasks on {a.date}"
    )
    per_day[a.date].add(a.assigned_to_id)

# Rule 3: vacuuming on configured days with configured people.
vacuum = [a for a in assignments if a.task_type == "vacuuming"]
vac_by_day = Counter(a.weekday for a in vacuum)
settings = __import__("schedule.models", fromlist=["SiteSettings"]).SiteSettings.load()
for wd in settings.vacuum_days:
    assert vac_by_day[wd] == settings.vacuum_people, (
        f"vacuum on weekday {wd}: {vac_by_day[wd]} != {settings.vacuum_people}"
    )

# Rule 4: cooking = 2 on Thursday(5) and Friday(6).
cooking = [a for a in assignments if a.task_type == "cooking"]
cook_by_day = Counter(a.weekday for a in cooking)
assert cook_by_day[5] == 2 and cook_by_day[6] == 2, f"cooking: {cook_by_day}"

# Rule 5: Friday never overloaded (max 1 task per person — already checked),
# and Friday has exactly 1 cleaning + vacuum + 2 cooking.
friday = [a for a in assignments if a.weekday == 6]
assert len(friday) == 1 + (settings.vacuum_people if 6 in settings.vacuum_days else 0) + 2

# --- long-term fairness sanity: generate 6 more weeks (skip existing), then
# compare the 7-week window ending this week. Cleaning gives everyone exactly
# 1 slot per generated week in an 8-member room; the wider bound tolerates a
# smoke-test confirmation or a substitution that touched one of the weeks.
u = User.objects.filter(is_superuser=False).first()
for i in range(1, 7):
    _target = week_start + timedelta(weeks=i)
    if not WeeklySchedule.objects.filter(week_start=_target).exists():
        generate_schedule(_target, u)

totals = Counter()
for a in Assignment.objects.filter(
    task_type="cleaning",
    date__gte=week_start - timedelta(weeks=6),
    date__lte=week_start + timedelta(days=6),
).values_list("assigned_to_id", flat=True):
    totals[a] += 1
counts = sorted(totals.values())
spread = counts[-1] - counts[0] if counts else 0
assert spread <= 3, f"cleaning fairness spread too big: {sorted(totals.values())}"

print("ALL SCHEDULING RULES PASSED")
print("cleaning per member over 7 weeks:", dict(sorted(totals.items())))
