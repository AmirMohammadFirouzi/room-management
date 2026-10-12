"""Seed the room: admin + 8 roommates, settings, and optional demo data.

Usage:
    python manage.py seed_room            # users + settings only
    python manage.py seed_room --demo     # also generate this week's schedule,
                                           # one expense and one substitution
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import User
from expenses.models import Expense, ExpenseShare, Payment
from schedule.models import SiteSettings, saturday_of
from schedule.scheduler import generate_schedule

ROOMMATES = [
    ("ali", "علی رضایی"),
    ("reza", "رضا محمدی"),
    ("amir", "امیر حسینی"),
    ("sina", "سینا کریمی"),
    ("pouya", "پویا احمدی"),
    ("mehrad", "مهراد صادقی"),
    ("kian", "کیان نوری"),
    ("arshia", "آرشیا مرادی"),
]

PASSWORD_DEFAULT = "room1234"


class Command(BaseCommand):
    help = "Create the admin, 8 roommates and default settings (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--demo",
            action="store_true",
            help="Also create a sample schedule, expense and substitution.",
        )

    def handle(self, *args, **options):
        User = get_user_model()

        # --- superuser for Django admin ---
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser(
                "admin", password=PASSWORD_DEFAULT, role=User.Role.ADMIN
            )
            self.stdout.write(self.style.SUCCESS("superuser 'admin' created"))

        # --- the 8 roommates ---
        for username, full_name in ROOMMATES:
            if not User.objects.filter(username=username).exists():
                User.objects.create_user(
                    username=username,
                    password=PASSWORD_DEFAULT,
                    display_name=full_name,
                    role=User.Role.MEMBER,
                )
                self.stdout.write(self.style.SUCCESS(f"member '{username}' created"))

        # --- one admin-role roommate (so the panel has a non-superuser admin) ---
        User.objects.filter(username="ali").update(role=User.Role.ADMIN)

        SiteSettings.load()
        self.stdout.write(self.style.SUCCESS("settings initialised"))

        if options["demo"]:
            self._demo()

        self.stdout.write(
            self.style.SUCCESS(
                f"\nAll accounts share the password: {PASSWORD_DEFAULT}"
            )
        )

    def _demo(self):
        from schedule.models import ScheduleStatus, WeeklySchedule

        week_start = saturday_of(date.today())
        schedule = WeeklySchedule.objects.filter(week_start=week_start).first()
        if schedule is None:
            admin_user = (
                User.objects.filter(role=User.Role.ADMIN).first()
                or User.objects.first()
            )
            schedule = generate_schedule(week_start, admin_user)
            self.stdout.write(self.style.SUCCESS("demo schedule generated"))
        if schedule.schedule_status != ScheduleStatus.PUBLISHED:
            import django.utils.timezone as tz

            schedule.schedule_status = ScheduleStatus.PUBLISHED
            schedule.published_at = tz.now()
            schedule.save(update_fields=["schedule_status", "published_at"])
            self.stdout.write(self.style.SUCCESS("demo schedule published"))

        # Sample expense split across everyone.
        if not Expense.objects.filter(title="مواد شوینده").exists():
            members = list(
                User.objects.filter(is_active=True, is_superuser=False)
            )
            expense = Expense.objects.create(
                title="مواد شوینده",
                total_amount=800_000,
                created_by=members[0],
            )
            base, rem = divmod(expense.total_amount, len(members))
            ExpenseShare.objects.bulk_create(
                [
                    ExpenseShare(
                        expense=expense,
                        user=m,
                        amount=base + (1 if i < rem else 0),
                    )
                    for i, m in enumerate(members)
                ]
            )
            share = expense.shares.first()
            payment = Payment.objects.create(
                share=share,
                amount=share.amount,
                card_last4="1234",
                submitted_by=share.user,
            )
            share.status = ExpenseShare.Status.PENDING
            share.save(update_fields=["status"])
            self.stdout.write(
                self.style.SUCCESS("demo expense + pending payment created")
            )
