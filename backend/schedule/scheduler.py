"""Fair rotational weekly schedule generator (rebuilt around server time).

Hard rules (never broken)
-------------------------
- Cleaning (نظافت): one person per day, Saturday → Friday, never the same
  person twice in the same week (requires >= 7 active members; the rule only
  relaxes when the room is short on people).
- At most ONE task per person per day — protects Friday, which stacks
  cleaning + vacuuming + cooking. A slot that cannot be filled without
  double-booking is DROPPED instead of violating the DB constraint.
- Vacuuming / cooking only on the admin-configured days with the configured
  participant counts (SiteSettings).

Fairness (transparent greedy ranking — no magic weights)
--------------------------------------------------------
Every eligible person is ranked by:
    (week load, all-time load, in-week task-type repeats, all-time task-type
     count, rotating member position)
and the smallest wins, so nobody does significantly more or less than the
others — neither inside a week nor across weeks. All history is computed from
SERVER dates only (``server_today()``), never the client clock.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db import transaction

from accounts.models import User

from .models import TaskType, SiteSettings, saturday_of, server_today

# ---------------------------------------------------------------------------
# How a slot picks its person (transparent, deterministic, fair)
# ---------------------------------------------------------------------------
# Every slot is filled by ranking the eligible members with this tuple —
# the smallest one wins:
#
#   1. tasks already handed out in the target week  → perfect intra-week balance
#   2. all-time task count from previous weeks     → fair rotation over weeks
#   3. same task type already given this week      → variety inside the week
#   4. all-time count of this exact task type      → variety over the weeks
#   5. rotating position of the member (week-based)→ deterministic tie-break
#
# Because history is frozen per week (only dates before ``week_start`` are
# counted), steps 1 and 5 are the only in-week signals — that is enough to
# guarantee the weekly load differs by at most one wherever capacity allows.
#
# Hard rules (never traded away for fairness):
#   * one task per person per day (also enforced by the DB constraint
#     ``uniq_person_per_day``); a slot is DROPPED, never double-booked.
#   * cleaning at most once per person per week when the room has >= 7 members.
#   * vacuuming/cooking only on the admin-configured days/people counts.
#
# NOTE: the cooking days/people are admin-configurable and come from
# SiteSettings (defaults: Thursday(5) + Friday(6), 2 people each).


class History:
    """Frozen statistics of every assignment before ``until`` (server dates)."""

    def __init__(self, until: date):
        self.task_counts: dict[tuple[int, str], int] = defaultdict(int)
        self.total_counts: dict[int, int] = defaultdict(int)

        from .models import Assignment

        past = Assignment.objects.filter(date__lt=until).values_list(
            "assigned_to_id", "task_type"
        )
        for member_id, task_type in past:
            self.task_counts[(member_id, task_type)] += 1
            self.total_counts[member_id] += 1


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
    week_task_counts: dict[tuple[int, str], int] = defaultdict(int)
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

        # Prefer people who have not yet done this task type this week.
        not_repeated = [
            m for m in eligible if week_task_counts[(m.id, task_type)] == 0
        ]
        if not_repeated:
            eligible = not_repeated

        if not eligible:
            # Room too small to fill this day's slots without giving someone a
            # second task the same day. The one-task-per-day rule is hard
            # (DB-enforced `uniq_person_per_day`), so skip the slot instead of
            # violating it — participant counts degrade gracefully.
            continue

        best = min(
            eligible,
            key=lambda m: (
                week_load[m.id],
                history.total_counts[m.id],
                week_task_counts[(m.id, task_type)],
                history.task_counts[(m.id, task_type)],
                (member_index[m.id] - week_number) % len(members),
            ),
        )

        if task_type == TaskType.CLEANING:
            cleaning_used.add(best.id)
        assigned[d].add(best.id)
        week_load[best.id] += 1
        week_task_counts[(best.id, task_type)] += 1
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
    return saturday_of(server_today())


def next_week_start() -> date:
    """Next Saturday after the current week (for the 'generate next' button)."""
    return current_week_start() + timedelta(days=7)
