"""Quick smoke tests for new backend features (draft/publish + notifications + payer)."""
import os
import django
from datetime import date, timedelta

os.chdir("backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from schedule.models import WeeklySchedule, Notification, ScheduleStatus, saturday_of
from expenses.models import Expense

User = get_user_model()
admin = User.objects.filter(username="admin").first()
member = User.objects.filter(username="reza").first()
assert admin and member, "seed the room first (python manage.py seed_room --demo)"

# 1) Create a DRAFT schedule for a future week.
ws = saturday_of(date.today() + timedelta(days=7))
draft, created = WeeklySchedule.objects.get_or_create(
    week_start=ws, defaults={"created_by": admin}
)
assert draft.schedule_status == ScheduleStatus.DRAFT
print("OK draft created:", draft.week_start, draft.schedule_status)

# 2) Publish it -> becomes PUBLISHED and notifies every active member once.
draft.schedule_status = ScheduleStatus.PUBLISHED
draft.published_at = django.utils.timezone.now()
draft.save()
print("OK published:", draft.schedule_status, draft.published_at)
owners = list(User.objects.filter(is_active=True, is_superuser=False))
for u in owners:
    n = Notification.objects.filter(user=u, kind=Notification.Kind.WEEK_SCHEDULE_PUBLISHED).first()
    assert n is not None, f"{u} missing notification"
print("OK notifications created (one per member):", [u.username for u in owners])

# 3) Expense.payer_name field.
exp, created = Expense.objects.get_or_create(
    title="Smoke test", total_amount=100000,
    defaults={"payer_name": "مدیریت", "created_by": member},
)
assert exp.payer_name == "مدیریت"
print("OK Expense.payer_name =", exp.payer_name)
print("ALL SMOKE TESTS PASSED")
