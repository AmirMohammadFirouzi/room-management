"""Expense ("دنگ") models: items, shares, card-to-card payment records."""

from django.db import models

from accounts.models import User


class Expense(models.Model):
    """An item bought for the room; total split among selected members."""

    title = models.CharField(max_length=200, verbose_name="نام آیتم")
    total_amount = models.PositiveBigIntegerField(verbose_name="مبلغ کل (تومان)")
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="expenses_created",
        verbose_name="ثبت‌کننده",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")
    note = models.CharField(max_length=255, blank=True, verbose_name="توضیح")

    class Meta:
        verbose_name = "هزینه"
        verbose_name_plural = "هزینه‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} — {self.total_amount} تومان"

    @property
    def remaining_balance(self) -> int:
        """How much of the total is not yet covered by approved payments."""
        approved = sum(
            p.amount for p in self.payments.filter(status=Payment.Status.APPROVED)
        )
        return max(self.total_amount - approved, 0)


class ExpenseShare(models.Model):
    """One member's slice of an expense (equal split, remainder to the first)."""

    class Status(models.TextChoices):
        UNPAID = "unpaid", "پرداخت نشده"
        PENDING = "pending", "در انتظار تأیید"
        PAID = "paid", "پرداخت شد"
        REJECTED = "rejected", "پرداخت رد شد"

    expense = models.ForeignKey(
        Expense,
        on_delete=models.CASCADE,
        related_name="shares",
        verbose_name="هزینه",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="expense_shares",
        verbose_name="عضو",
    )
    amount = models.PositiveBigIntegerField(verbose_name="سهم (تومان)")
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.UNPAID,
        verbose_name="وضعیت",
    )

    class Meta:
        verbose_name = "سهم هزینه"
        verbose_name_plural = "سهم‌های هزینه"
        constraints = [
            models.UniqueConstraint(
                fields=["expense", "user"], name="uniq_share_per_expense_user"
            ),
        ]

    def __str__(self):
        return f"{self.user}: {self.amount} تومان ({self.get_status_display()})"


class Payment(models.Model):
    """Card-to-card payment claim: last 4 digits, awaiting admin approval."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار تأیید"
        APPROVED = "approved", "تأیید شد"
        REJECTED = "rejected", "رد شد"

    share = models.ForeignKey(
        ExpenseShare,
        on_delete=models.CASCADE,
        related_name="payments",
        verbose_name="سهم",
    )
    amount = models.PositiveBigIntegerField(verbose_name="مبلغ (تومان)")
    card_last4 = models.CharField(
        max_length=4, verbose_name="۴ رقم آخر کارت"
    )
    submitted_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payments_submitted",
        verbose_name="پرداخت‌کننده",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name="وضعیت",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")
    decided_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تصمیم")
    decided_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments_decided",
        verbose_name="تصمیم‌گیرنده",
    )
    reject_reason = models.CharField(
        max_length=255, blank=True, verbose_name="دلیل رد"
    )

    class Meta:
        verbose_name = "پرداخت"
        verbose_name_plural = "پرداخت‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.share.user} — {self.amount} ({self.get_status_display()})"
