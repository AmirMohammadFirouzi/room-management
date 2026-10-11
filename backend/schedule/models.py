"""Domain models: settings, weekly schedules, assignments, substitutions."""

from datetime import date as date_cls
from datetime import timedelta

from django.db import models

from accounts.models import User

# Persian week: Saturday = 0 ... Friday = 6
WEEKDAY_LABELS = [
    "شنبه",
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
]


def persian_weekday(d: date_cls) -> int:
    """0 = Saturday ... 6 = Friday (Python: Monday=0 ... Sunday=6)."""
    return (d.weekday() + 2) % 7


def saturday_of(d: date_cls) -> date_cls:
    """Return the Saturday that starts the week containing ``d``."""
    return d - timedelta(days=persian_weekday(d))


class TaskType(models.TextChoices):
    CLEANING = "cleaning", "نظافت"
    VACUUMING = "vacuuming", "جاروبرقی"
    COOKING = "cooking", "آشپزی"


class SiteSettings(models.Model):
    """Singleton row holding the admin-configurable knobs."""

    vacuum_days = models.JSONField(
        default=list,
        help_text="روزهای جاروبرقی؛ آرایه‌ای از اعداد ۰ (شنبه) تا ۶ (جمعه)",
        verbose_name="روزهای جاروبرقی",
    )
    vacuum_people = models.PositiveSmallIntegerField(
        default=2, verbose_name="تعداد نفرات جاروبرقی"
    )
    cleaning_enabled = models.BooleanField(default=True, verbose_name="فعال بودن نظافت")
    vacuuming_enabled = models.BooleanField(
        default=True, verbose_name="فعال بودن جاروبرقی"
    )
    cooking_enabled = models.BooleanField(default=True, verbose_name="فعال بودن آشپزی")

    class Meta:
        verbose_name = "تنظیمات سامانه"
        verbose_name_plural = "تنظیمات سامانه"

    def __str__(self):
        return "تنظیمات سامانه"

    def save(self, *args, **kwargs):
        # Keep at most one row (poor-man's singleton).
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        if not obj.vacuum_days:
            # Default: Monday(2), Wednesday(4), Friday(6)
            obj.vacuum_days = [2, 4, 6]
            obj.save(update_fields=["vacuum_days"])
        return obj


class WeeklySchedule(models.Model):
    """One generated schedule for the week starting Saturday ``week_start``."""

    week_start = models.DateField(unique=True, verbose_name="شروع هفته (شنبه)")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ایجاد")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_schedules",
        verbose_name="ایجادکننده",
    )

    class Meta:
        verbose_name = "برنامه هفتگی"
        verbose_name_plural = "برنامه‌های هفتگی"
        ordering = ["-week_start"]

    @property
    def week_end(self) -> date_cls:
        return self.week_start + timedelta(days=6)

    def __str__(self):
        return f"هفته‌ی {self.week_start}"


class Assignment(models.Model):
    """One task slot: a person assigned to a task on a date."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار انجام"
        CONFIRMED = "confirmed", "انجام شد"

    schedule = models.ForeignKey(
        WeeklySchedule,
        on_delete=models.CASCADE,
        related_name="assignments",
        verbose_name="برنامه",
    )
    date = models.DateField(verbose_name="تاریخ")
    weekday = models.PositiveSmallIntegerField(verbose_name="روز هفته")  # 0=شنبه
    task_type = models.CharField(
        max_length=20, choices=TaskType.choices, verbose_name="نوع کار"
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="assignments",
        verbose_name="مسئول",
    )
    original_assignee = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="original_assignments",
        verbose_name="مسئول اولیه",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name="وضعیت",
    )
    confirmed_at = models.DateTimeField(
        null=True, blank=True, verbose_name="زمان تأیید"
    )

    class Meta:
        verbose_name = "تکلیف"
        verbose_name_plural = "تکالیف"
        ordering = ["date", "id"]
        constraints = [
            # A person cannot hold two tasks on the same day.
            models.UniqueConstraint(
                fields=["date", "assigned_to"], name="uniq_person_per_day"
            ),
        ]

    @property
    def is_substituted(self) -> bool:
        return (
            self.original_assignee_id is not None
            and self.original_assignee_id != self.assigned_to_id
        )

    def __str__(self):
        return f"{self.get_task_type_display()} — {self.assigned_to} — {self.date}"


class SubstitutionRequest(models.Model):
    """A asks B to cover A's task; admin approves/rejects."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار تأیید"
        APPROVED = "approved", "تأیید شد"
        REJECTED = "rejected", "رد شد"

    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name="substitution_requests",
        verbose_name="تکلیف",
    )
    requested_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="substitutions_requested",
        verbose_name="درخواست‌دهنده",
    )
    replacement = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="substitutions_received",
        verbose_name="جایگزین",
    )
    reason = models.CharField(max_length=255, blank=True, verbose_name="دلیل")
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name="وضعیت",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان درخواست")
    decided_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تصمیم")
    decided_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="substitutions_decided",
        verbose_name="تصمیم‌گیرنده",
    )
    reject_reason = models.CharField(
        max_length=255, blank=True, verbose_name="دلیل رد"
    )

    class Meta:
        verbose_name = "درخواست جایگزینی"
        verbose_name_plural = "درخواست‌های جایگزینی"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.requested_by} ← {self.replacement} ({self.status})"


class SubstitutionCredit(models.Model):
    """Inverse-replacement credit ledger.

    If Reza covers Ali's task, Ali becomes the *debtor* and Reza the
    *creditor*: later, when Reza needs a substitute, Ali is preferred so the
    credit is settled. One row per favor, settled exactly once.
    """

    debtor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="favors_owed",
        verbose_name="بدهکار",
        help_text="کسی که باید جبران کند",
    )
    creditor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="favors_credited",
        verbose_name="طلبکار",
        help_text="کسی که لطف کرده و باید جبران شود",
    )
    created_by = models.ForeignKey(
        SubstitutionRequest,
        on_delete=models.CASCADE,
        related_name="credits",
        verbose_name="مبدأ",
    )
    settled_by = models.ForeignKey(
        SubstitutionRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="settled_credits",
        verbose_name="تسویه‌کننده",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ایجاد")
    settled_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تسویه")

    class Meta:
        verbose_name = "اعتبار جایگزینی"
        verbose_name_plural = "اعتبارهای جایگزینی"
        ordering = ["-created_at"]

    @property
    def is_open(self) -> bool:
        return self.settled_at is None

    def __str__(self):
        state = "باز" if self.is_open else "تسویه‌شده"
        return f"{self.debtor} بدهکار {self.creditor} ({state})"

