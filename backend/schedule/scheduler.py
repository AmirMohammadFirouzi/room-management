"""Fair rotating weekly schedule generator.

Hard rules
----------
- Cleaning (نظافت): one person per day, Saturday → Friday, never the same
  person twice in the same week (requires >= 7 active members; the rule only
  relaxes when the room is short on people).
- At most ONE task per person per day — protects Friday, which stacks
  cleaning + vacuuming + cooking.

Soft fairness (score minimisation)
----------------------------------
- Long-term per-task history (no one person doing a task type far more).
- No same task type as last week; no task on the same weekday as last week.
- Recent (4 weeks) and current-week load smoothing.
- Deterministic rotation tie-break so equal scores still rotate weekly.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db import transaction

from accounts.models import User

from .models import TaskType, SiteSettings, persian_weekday, saturday_of

# ---------------------------------------------------------------------------
# Tunable weights — bigger = stronger avoidance.
# ---------------------------------------------------------------------------
W_LONG_TERM_TASK = 3.0          # all-time count of this task type
W_TOTAL_WORK = 0.4              # all-time total tasks (overall equality)
W_RECENT_TASK = 4.0             # same task type within the last 4 weeks
W_REPEAT_TASK_LAST_WEEK = 8.0   # identical task type as last week
W_SAME_WEEKDAY_LAST_WEEK = 6.0  # any task on the same weekday last week
W_WEEK_LOAD = 3.0               # tasks already assigned in the target week
W_REUSE_CLEANING = 50.0         # breaking the strict rule (fallback only)

# NOTE: the cooking days/people are admin-configurable and come from
# SiteSettings (defaults: Thursday(5) + Friday(6), 2 people each).


class History:
    """Aggregated past-assignment statistics used by the scoring function."""

    def __init__(self, until: date):
        self.task_counts: dict[tuple[int, str], int] = defaultdict(int)
        self.total_counts: dict[int, int] = defaultdict(int)
        self.recent_task_counts: dict[tuple[int, str], int] = defaultdict(int)
        self.last_week_tasks: dict[int, set[str]] = defaultdict(set)
        self.last_week_weekdays: dict[int, set[int]] = defaultdict(set)

        from .models import Assignment

        last_week_start = until - timedelta(days=7)
        past = Assignment.objects.filter(date__lt=until).values_list(
            "assigned_to_id", "task_type", "date"
        )
        for member_id, task_type, d in past:
            self.task_counts[(member_id, task_type)] += 1
            self.total_counts[member_id] += 1
            if d >= until - timedelta(days=28):
                self.recent_task_counts[(member_id, task_type)] += 1
            if last_week_start <= d < until:
                self.last_week_tasks[member_id].add(task_type)
                self.last_week_weekdays[member_id].add(persian_weekday(d))


def build_slots(week_start: date, settings: SiteSettings) -> list[tuple[date, int, str]]:
    """Return [(date, persian_weekday, task_type)] for one week, tightest first."""
    days: list[tuple[date, int, list[str]]] = []
    for offset in range(7):
        d = week_start + timedelta(days=offset)
        tasks: list[str] = []
        if settings.cleaning_enabled:
            tasks.append(TaskType.CLEANING)
        if settings.vacuuming_enabled and offset in (settings.vacuum_days or []):
            tasks.extend([TaskType.VACUUMING] * int(settings.vacuum_people or 0))
        if settings.cooking_enabled and offset in (settings.cooking_days or []):
            tasks.extend([TaskType.COOKING] * int(settings.cooking_people or 0))
        days.append((d, offset, tasks))

    # Busiest days first (Friday = 5 slots): resolve the tight constraints
    # before the easy single-slot days.
    days.sort(key=lambda item: (-len(item[2]), item[1]))

    slots: list[tuple[date, int, str]] = []
    for d, wd, tasks in days:
        # Within a day fill scarce tasks first (cooking/vacuuming) and leave
        # cleaning last so its week-unique rule has the widest choice.
        for t in sorted(tasks, key=lambda t: 0 if t != TaskType.CLEANING else 1):
            slots.append((d, wd, t))
    return slots


def score(
    history: History,
    member_id: int,
    task_type: str,
    weekday: int,
    week_load: dict[int, int],
    cleaning_used: set[int],
) -> float:
    h = history
    s = W_LONG_TERM_TASK * h.task_counts[(member_id, task_type)]
    s += W_TOTAL_WORK * h.total_counts[member_id]
    s += W_RECENT_TASK * h.recent_task_counts[(member_id, task_type)]
    if task_type in h.last_week_tasks[member_id]:
        s += W_REPEAT_TASK_LAST_WEEK
    if weekday in h.last_week_weekdays[member_id]:
        s += W_SAME_WEEKDAY_LAST_WEEK
    s += W_WEEK_LOAD * week_load[member_id]
    if task_type == TaskType.CLEANING and member_id in cleaning_used:
        # Fallback only: the room has fewer than 7 active members.
        s += W_REUSE_CLEANING
    return s


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------
@transaction.atomic
def generate_schedule(week_start: date, generated_by, replace: bool = False):
    """Create (or replace) the schedule for the week containing ``week_start``."""
    from rest_framework.exceptions import ValidationError

    from .models import Assignment, WeeklySchedule

    week_start = saturday_of(week_start)
    settings = SiteSettings.load()

    members = list(
        User.objects.filter(is_active=True, is_superuser=False).order_by("id")
    )
    if len(members) < 2:
        raise ValidationError("برای ساخت برنامه حداقل ۲ عضو فعال لازم است.")

    existing = WeeklySchedule.objects.filter(week_start=week_start).first()
    if existing:
        if not replace:
            raise ValidationError("برای این هفته قبلاً برنامه ساخته شده است.")
        if existing.assignments.filter(status="confirmed").exists():
            raise ValidationError(
                "برنامه‌ی این هفته تکالیف تأییدشده دارد و قابل بازسازی نیست."
            )
        existing.delete()

    history = History(until=week_start)
    slots = build_slots(week_start, settings)
    week_number = week_start.toordinal() // 7
    member_index = {m.id: i for i, m in enumerate(members)}

    assigned: dict[date, set[int]] = defaultdict(set)  # busy people per day
    week_load: dict[int, int] = defaultdict(int)       # tasks this week
    cleaning_used: set[int] = set()
    results: list[tuple[date, int, str, User]] = []

    for d, wd, task_type in slots:
        busy = assigned[d]

        # Hard filter: nobody a second task on the same day.
        eligible = [m for m in members if m.id not in busy]

        # Hard filter: cleaning at most once per week (room of 7+ members).
        if task_type == TaskType.CLEANING and len(members) >= 7:
            not_cleaned_yet = [m for m in eligible if m.id not in cleaning_used]
            if not_cleaned_yet:
                eligible = not_cleaned_yet

        if not eligible:
            # Tiny room: allow a second task that day as a last resort.
            eligible = list(members)

        best = min(
            eligible,
            key=lambda m: (
                score(history, m.id, task_type, wd, week_load, cleaning_used),
                history.total_counts[m.id],
                (member_index[m.id] - week_number) % len(members),
            ),
        )

        if task_type == TaskType.CLEANING:
            cleaning_used.add(best.id)
        assigned[d].add(best.id)
        week_load[best.id] += 1
        results.append((d, wd, task_type, best))

    schedule = WeeklySchedule.objects.create(
        week_start=week_start, created_by=generated_by
    )
    Assignment.objects.bulk_create(
        [
            Assignment(
                schedule=schedule,
                date=d,
                weekday=wd,
                task_type=task_type,
                assigned_to=user,
            )
            for d, wd, task_type, user in results
        ]
    )
    return schedule


# ---------------------------------------------------------------------------
# Helpers exposed to the API
# ---------------------------------------------------------------------------
def current_week_start() -> date:
    return saturday_of(date.today())


def next_week_start() -> date:
    """Next Saturday after the current week (for the 'generate next' button)."""
    return current_week_start() + timedelta(days=7)
