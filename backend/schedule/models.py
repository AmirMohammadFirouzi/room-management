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


def server_today() -> date_cls:
    """The application's *current* date — always taken from the SERVER.

    Uses Django's active timezone (Asia/Tehran, see settings), never the
    client's browser clock. Every date-sensitive decision (today, week start,
    confirm gating, dashboard split) must go through this helper so a wrong
    or skewed browser clock can never shift a day.
    """
    from django.utils import timezone

    return timezone.localdate()


class TaskType(models.TextChoices):
    CLEANING = "cleaning", "نظافت"
    VACUUMING = "vacuuming", "جاروبرقی"
    COOKING = "cooking", "آشپزی"


class ScheduleStatus(models.TextChoices):
    DRAFT = "draft", "پیش‌نویس"
    PUBLISHED = "published", "منتشر شده"


class SiteSettings(models.Model):
    """Singleton row holding the admin-configurable knobs."""

    # --- branding (login page + header; editable by the admin) -------------
    site_title = models.CharField(
        max_length=120,
        default="مدیریت اتاق مشترک",
        verbose_name="عنوان سامانه",
        help_text="عنوانی که در صفحه‌ی ورود و بالای برنامه نمایش داده می‌شود.",
    )
    site_logo = models.CharField(
        max_length=20,
        default="🏠",
        blank=True,
        verbose_name="لوگو (ایموجی یا چند حرف)",
        help_text="یک اموجی یا حداکثر ۲ حرف؛ خالی بماند از آیکون پیش‌فرض استفاده می‌شود.",
    )
    site_logo_image = models.TextField(
        blank=True,
        default="",
        verbose_name="تصویر لوگوی ورود",
        help_text="تصویر آپلودشده به‌صورت data URL؛ خالی بماند از اموجی/حرف بالا استفاده می‌شود.",
    )

    # --- card-to-card payment target (shown as a 3D card) ------------------
    bank_name = models.CharField(
        max_length=80, default="بانک ملت", verbose_name="نام بانک"
    )
    bank_logo = models.CharField(
        max_length=12, default="ملت", blank=True, verbose_name="لوگوی بانک"
    )
    bank_logo_image = models.TextField(
        blank=True,
        default="",
        verbose_name="تصویر لوگوی بانک",
        help_text="تصویر آپلودشده به‌صورت data URL؛ خالی بماند از متن لوگو استفاده می‌شود.",
    )
    brand_color = models.CharField(
        max_length=20,
        default="#1E40AF",
        verbose_name="رنگ کارت",
        help_text="رنگ HEX کارت بانکی، مثلا #1E40AF",
    )
    card_number = models.CharField(
        max_length=24,
        default="6104337812345678",
        verbose_name="شماره کارت",
        help_text="۱۶ رقم بدون فاصله.",
    )
    card_holder = models.CharField(
        max_length=120,
        default="اتاق مشترک",
        blank=True,
        verbose_name="صاحب کارت",
    )

    # --- task configuration ------------------------------------------------
    vacuum_days = models.JSONField(
        default=list,
        help_text="روزهای جاروبرقی؛ آرایه‌ای از اعداد ۰ (شنبه) تا ۶ (جمعه)",
        verbose_name="روزهای جاروبرقی",
    )
    vacuum_people = models.PositiveSmallIntegerField(
        default=2, verbose_name="تعداد نفرات جاروبرقی"
    )
    cooking_days = models.JSONField(
        default=list,
        help_text="روزهای آشپزی؛ آرایه‌ای از اعداد ۰ (شنبه) تا ۶ (جمعه)",
        verbose_name="روزهای آشپزی",
    )
    cooking_people = models.PositiveSmallIntegerField(
        default=2, verbose_name="تعداد نفرات آشپزی"
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
        changed = False
        if not obj.vacuum_days:
            # Default: Monday(2), Wednesday(4), Friday(6)
            obj.vacuum_days = [2, 4, 6]
            changed = True
        if not obj.cooking_days:
            # Default: Thursday(5), Friday(6)
            obj.cooking_days = [5, 6]
            changed = True
        if changed:
            obj.save()
        return obj


class WeeklySchedule(models.Model):
    """One generated schedule for the week starting Saturday ``week_start``.

    It lives in draft mode until an admin explicitly publishes it.
    """

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
    # Draft or published.
    schedule_status = models.CharField(
        max_length=10,
        choices=ScheduleStatus.choices,
        default=ScheduleStatus.DRAFT,
        verbose_name="وضعیت برنامه",
    )
    # When the schedule was first published (None while in draft).
    published_at = models.DateTimeField(
        null=True, blank=True, verbose_name="زمان انتشار"
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


class Notification(models.Model):
    """Per-user notification; grouped into one general weekly notification."""

    class Kind(models.TextChoices):
        WEEK_SCHEDULE_PUBLISHED = "week_schedule_published", "برنامه‌ی هفته منتشر شد"
        NEW_ASSIGNMENT = "new_assignment", "تکلیف جدید"
        ASSIGNMENT_CONFIRMED = "assignment_confirmed", "تکلیف تأیید شد"
        SUB_REJECTED = "sub_rejected", "درخواست جایگزینی رد شد"
        PAYMENT_APPROVED = "payment_approved", "پرداخت شما تایید شد"
        WELCOME = "welcome", "خوش‌آمد گویی"
        NEW_EXPENSE = "new_expense", "هزینه‌ی جدید"
        ANNOUNCEMENT = "announcement", "اطلاعیه‌ی مدیر"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name="کاربر",
    )
    kind = models.CharField(
        max_length=30, choices=Kind.choices, verbose_name="نوع اعلان"
    )
    # Title shown as the headline of the message card.
    title = models.CharField(
        max_length=60, blank=True, verbose_name="عنوان اعلان"
    )
    # Short description/note giving the full details.
    description = models.CharField(
        max_length=280, blank=True, verbose_name="توضیح اعلان"
    )
    message = models.CharField(max_length=400, verbose_name="متن اعلان")
    data = models.JSONField(
        default=dict, blank=True, verbose_name="دیتا اضافی (مثلا weekly week_start)"
    )
    is_read = models.BooleanField(default=False, verbose_name="خوانده‌شده")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان اعلان")

    class Meta:
        verbose_name = "اعلان"
        verbose_name_plural = "اعلان‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} — {self.get_kind_display()}"

    @classmethod
    def notify(cls, user, kind: str, message: str, data: dict | None = None):
        """Refresh one notification per (user, kind).

        The (user, kind) unique constraint was intentionally dropped so
        history (announcements, welcome messages) can stack — so this helper
        now refreshes the newest row of that kind and folds any older
        duplicates into it, instead of relying on update_or_create.

        The headline shown on the card is derived from the first line of the
        message; the full text stays in `message` (and `description` where set).
        """
        rows = cls.objects.filter(user=user, kind=kind).order_by("-id")
        newest = rows.first()
        if newest is not None:
            title = (newest.title or "").strip()
            if not title:
                title = message.split("\n", 1)[0].strip()
                if len(title) > 50:
                    title = title[:47] + "…"
            newest.title = title
            newest.message = message
            newest.description = newest.description or ""
            newest.data = data or {}
            newest.is_read = False
            newest.save(
                update_fields=[
                    "title", "message", "description", "data", "is_read"
                ]
            )
            rows.exclude(pk=newest.pk).delete()
            return newest

        title = message.split("\n", 1)[0].strip()
        if len(title) > 50:
            title = title[:47] + "…"
        return cls.objects.create(
            user=user,
            kind=kind,
            title=title,
            message=message,
            description="",
            data=data or {},
            is_read=False,
        )

    @classmethod
    def notify_many(cls, users, kind: str, message: str, data: dict | None = None):
        """Same as :meth:`notify` for a queryset/list of users."""
        return [cls.notify(u, kind, message, data) for u in users]

