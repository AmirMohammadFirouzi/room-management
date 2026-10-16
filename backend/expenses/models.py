"""Expense ("دنگ") models: items, shares, card-to-card payment records."""

from django.db import models

from accounts.models import User


class Expense(models.Model):
    """An item bought for the room; total split among selected members."""

    title = models.CharField(max_length=200, verbose_name="نام آیتم")
    total_amount = models.PositiveBigIntegerField(verbose_name="مبلغ کل (تومان)")
    payer_name = models.CharField(
        max_length=200, blank=True, default="مدیریت", verbose_name="هزینه‌گذار"
    )
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


class Wallet(models.Model):
    """Pre-loaded دنگ credit per member.

    Members see only their own balance; the admin can see and top up all
    wallets. Shares of an expense may be settled directly from the wallet.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="wallet",
        verbose_name="عضو",
    )
    balance = models.PositiveBigIntegerField(
        default=0, verbose_name="موجودی (تومان)"
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="به‌روزرسانی")

    class Meta:
        verbose_name = "کیف پول"
        verbose_name_plural = "کیف پول‌ها"

    def __str__(self):
        return f"{self.user}: {self.balance} تومان"

    @classmethod
    def get_balance(cls, user) -> int:
        """Current balance (0 when the wallet row does not exist yet)."""
        wallet = cls.objects.filter(user=user).first()
        return wallet.balance if wallet else 0


class WalletTransaction(models.Model):
    """Ledger row for every wallet movement (audit trail)."""

    class Kind(models.TextChoices):
        TOPUP = "topup", "شارژ کیف پول"
        EXPENSE = "expense", "پرداخت هزینه از کیف پول"
        ADJUST = "adjust", "اصلاح دستی"

    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.CASCADE,
        related_name="transactions",
        verbose_name="کیف پول",
    )
    amount = models.IntegerField(
        verbose_name="مبلغ (تومان؛ منفی = کسر)"
    )
    kind = models.CharField(
        max_length=10, choices=Kind.choices, verbose_name="نوع"
    )
    note = models.CharField(max_length=255, blank=True, verbose_name="توضیح")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wallet_actions",
        verbose_name="ثبت‌کننده",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان")

    class Meta:
        verbose_name = "تراکنش کیف پول"
        verbose_name_plural = "تراکنش‌های کیف پول"
        ordering = ["-created_at"]

    def __str__(self):
        sign = "+" if self.amount >= 0 else ""
        return f"{self.wallet.user} {sign}{self.amount} ({self.get_kind_display()})"
