"""Quick validation of the scheduling hard rules (run via `manage.py shell`)."""

from collections import Counter, defaultdict
from datetime import date, timedelta

from accounts.models import User
from schedule.models import Assignment, WeeklySchedule, persian_weekday, saturday_of
from schedule.scheduler import generate_schedule

week_start = saturday_of(date.today())
ws = WeeklySchedule.objects.filter(week_start=week_start).first()
assert ws, "no schedule for current week"

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

# --- long-term fairness sanity: generate 6 more weeks and compare counts ---
u = User.objects.filter(is_superuser=False).first()
for i in range(1, 7):
    generate_schedule(week_start + timedelta(weeks=i), u)

totals = Counter()
for a in Assignment.objects.filter(task_type="cleaning").values_list(
    "assigned_to_id", flat=True
):
    totals[a] += 1
counts = sorted(totals.values())
spread = counts[-1] - counts[0] if counts else 0
assert spread <= 2, f"cleaning fairness spread too big: {sorted(totals.values())}"

print("ALL SCHEDULING RULES PASSED")
print("cleaning per member over 7 weeks:", dict(sorted(totals.items())))
