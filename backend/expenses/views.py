from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.views import IsAdminRole

from .models import Expense, ExpenseShare, Payment, Wallet, WalletTransaction
from .serializers import (
    BulkPaymentCreateSerializer,
    ExpenseCreateSerializer,
    ExpenseSerializer,
    PaymentCreateSerializer,
    PaymentDecisionSerializer,
    PaymentSerializer,
    WalletSerializer,
    WalletTopupSerializer,
    WalletTransactionSerializer,
)


def split_amount(total: int, n: int) -> list[int]:
    """Equal split; distribute the remainder (toman) over the first shares."""
    base, remainder = divmod(total, n)
    return [base + (1 if i < remainder else 0) for i in range(n)]


class ExpenseListCreateView(generics.ListCreateAPIView):
    queryset = Expense.objects.prefetch_related("shares__user", "shares__payments")
    serializer_class = ExpenseSerializer

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ExpenseCreateSerializer
        return ExpenseSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # Privacy: members only ever see their own slice of an invoice.
        # Admins get the full دنگ breakdown.
        if self.request.method != "POST" and not self.request.user.is_admin_role:
            ctx["share_user"] = self.request.user
        return ctx

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = ExpenseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        member_ids = data.get("member_ids") or list(
            User.objects.filter(
                is_active=True, is_superuser=False
            ).values_list("id", flat=True)
        )
        payer_name = data.get("payer_name", "مدیریت")
        expense = Expense.objects.create(
            title=data["title"],
            total_amount=data["total_amount"],
            note=data.get("note", ""),
            created_by=request.user,
            payer_name=payer_name,
        )
        amounts = split_amount(expense.total_amount, len(member_ids))
        ExpenseShare.objects.bulk_create(
            [
                ExpenseShare(expense=expense, user_id=uid, amount=amount)
                for uid, amount in zip(member_ids, amounts)
            ]
        )
        expense = Expense.objects.prefetch_related("shares__user").get(
            pk=expense.pk
        )

        # Optional: settle every share straight from the members' wallets.
        wallet_paid_ids: set[int] = set()
        if data.get("pay_from_wallet"):
            wallet_paid_ids = _pay_shares_from_wallets(expense, request.user)

        _notify_new_expense(expense, member_ids, wallet_paid_ids)
        return Response(
            ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED
        )


def _pay_shares_from_wallets(expense, admin_user) -> set[int]:
    """Deduct each share from the member's wallet and mark it paid.

    Runs inside the caller's transaction; pre-checks all balances so nothing
    is mutated when someone's wallet is too low.
    """
    shares = list(expense.shares.select_related("user"))
    wallets = {
        w.user_id: w
        for w in Wallet.objects.filter(
            user_id__in=[s.user_id for s in shares]
        )
    }
    broke = [
        s.user.display_name
        for s in shares
        if Wallet.get_balance(s.user) < s.amount
    ]
    if broke:
        from rest_framework.exceptions import ValidationError

        raise ValidationError(
            {
                "pay_from_wallet": (
                    "موجودی کیف پول برای پرداخت کافی نیست: " + "، ".join(broke)
                )
            }
        )

    paid_ids: set[int] = set()
    for share in shares:
        wallet = wallets.get(share.user_id)
        if wallet is None:
            wallet = Wallet.objects.create(user_id=share.user_id)
        wallet.balance -= share.amount
        wallet.save(update_fields=["balance", "updated_at"])
        WalletTransaction.objects.create(
            wallet=wallet,
            amount=-share.amount,
            kind=WalletTransaction.Kind.EXPENSE,
            note=f"«{expense.title}»",
            created_by=admin_user,
        )
        share.status = ExpenseShare.Status.PAID
        share.save(update_fields=["status"])
        paid_ids.add(share.user_id)
    return paid_ids


def _notify_new_expense(expense, member_ids, wallet_paid_ids=None) -> None:
    """Tell the sharers (or everyone) that a new expense was added."""
    from schedule.models import Notification

    wallet_paid_ids = wallet_paid_ids or set()
    users = User.objects.filter(is_active=True, is_superuser=False)
    if member_ids:
        users = users.filter(id__in=member_ids)
    from common.jalali import fa_digits

    Notification.objects.bulk_create(
        [
            Notification(
                user=u,
                kind=Notification.Kind.NEW_EXPENSE,
                message=(
                    f"هزینه‌ی جدید «{expense.title}» به مبلغ "
                    f"{fa_digits(f'{expense.total_amount:,}')} تومان ثبت شد؛ "
                    f"سهم شما را در بخش هزینه‌ها ببینید."
                    + (
                        " سهم شما به‌صورت خودکار از کیف پول پرداخت شد."
                        if u.id in wallet_paid_ids
                        else ""
                    )
                ),
                data={"expense": expense.id},
            )
            for u in users
        ]
    )


class ExpenseDetailView(APIView):
    """Edit or delete an expense — allowed for the creator or an admin.

    The total and the member list may only change while every share is still
    unpaid, so money that is already settled is never silently rewritten.
    """

    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _get(pk):
        try:
            return Expense.objects.prefetch_related("shares__user").get(pk=pk)
        except Expense.DoesNotExist:
            return None

    @staticmethod
    def _allowed(request, expense):
        return request.user.is_admin_role or expense.created_by_id == request.user.id

    @transaction.atomic
    def patch(self, request, pk):
        expense = self._get(pk)
        if expense is None:
            return Response({"detail": "هزینه پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        if not self._allowed(request, expense):
            return Response(
                {"detail": "شما اجازه‌ی ویرایش این هزینه را ندارید."}, status=status.HTTP_403_FORBIDDEN
            )

        serializer = ExpenseCreateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        locked = expense.shares.exclude(status=ExpenseShare.Status.UNPAID).exists()
        new_total = data.get("total_amount", expense.total_amount)
        new_members = data.get("member_ids")

        if locked and new_total != expense.total_amount:
            return Response(
                {"detail": "بخشی از این هزینه پرداخت شده؛ مبلغ قابل تغییر نیست."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if locked and new_members is not None:
            return Response(
                {"detail": "بخشی از این هزینه پرداخت شده؛ اعضا قابل تغییر نیستند."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expense.title = data.get("title", expense.title)
        expense.total_amount = new_total
        expense.note = data.get("note", expense.note)
        if "payer_name" in data:
            expense.payer_name = data["payer_name"]
        expense.save()

        # Only runs when nothing is settled yet, so a clean re-split is safe.
        if new_members is not None and not locked:
            member_ids = sorted(set(new_members))
            expense.shares.all().delete()
            amounts = split_amount(expense.total_amount, len(member_ids))
            ExpenseShare.objects.bulk_create(
                [
                    ExpenseShare(expense=expense, user_id=uid, amount=amount)
                    for uid, amount in zip(member_ids, amounts)
                ]
            )

        expense = Expense.objects.prefetch_related("shares__user").get(pk=expense.pk)
        return Response(ExpenseSerializer(expense).data)

    def delete(self, request, pk):
        expense = self._get(pk)
        if expense is None:
            return Response({"detail": "هزینه پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        if not self._allowed(request, expense):
            return Response(
                {"detail": "شما اجازه‌ی حذف این هزینه را ندارید."}, status=status.HTTP_403_FORBIDDEN
            )
        expense.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyBalanceView(APIView):
    """Debts/credits summary for the current user."""

    def get(self, request):
        shares = ExpenseShare.objects.filter(user=request.user).select_related(
            "expense"
        )
        owed_total = sum(s.amount for s in shares)
        paid_total = sum(
            s.amount for s in shares if s.status == ExpenseShare.Status.PAID
        )
        pending_total = sum(
            s.amount for s in shares if s.status == ExpenseShare.Status.PENDING
        )
        rejected_total = sum(
            s.amount for s in shares if s.status == ExpenseShare.Status.REJECTED
        )
        # Shares of expenses I created that others have not settled yet.
        others_owed = sum(
            s.amount
            for s in ExpenseShare.objects.filter(expense__created_by=request.user)
            .exclude(user=request.user)
            .exclude(status=ExpenseShare.Status.PAID)
        )
        return Response(
            {
                "owed_total": owed_total,
                "paid_total": paid_total,
                "pending_total": pending_total,
                "rejected_total": rejected_total,
                "unpaid_total": owed_total - paid_total,
                "others_owed_to_me": others_owed,
            }
        )



class SubmitPaymentView(APIView):
    """Member claims a card-to-card payment for their own share."""

    def post(self, request, share_id):
        try:
            share = ExpenseShare.objects.select_related("expense").get(
                pk=share_id
            )
        except ExpenseShare.DoesNotExist:
            return Response(
                {"detail": "سهم پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        if share.user_id != request.user.id and not request.user.is_admin_role:
            return Response(
                {"detail": "فقط صاحب سهم می‌تواند پرداخت را ثبت کند."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if share.status == ExpenseShare.Status.PAID:
            return Response(
                {"detail": "این سهم قبلاً پرداخت شده است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if share.status == ExpenseShare.Status.PENDING:
            return Response(
                {"detail": "پرداخت این سهم در انتظار تأیید مدیر است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment = Payment.objects.create(
            share=share,
            amount=share.amount,
            card_last4=serializer.validated_data["card_last4"],
            submitted_by=request.user,
        )
        share.status = ExpenseShare.Status.PENDING
        share.save(update_fields=["status"])
        return Response(PaymentSerializer(payment).data, status=201)


class BulkPaymentView(APIView):
    """Pay several of my own unpaid shares at once with a single card claim.

    Accepts ``share_ids`` + one ``card_last4``; only shares that belong to the
    caller and are currently ``unpaid``/``rejected`` are processed. Returns the
    created payments plus the combined total so the UI can confirm.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = BulkPaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        share_ids = serializer.validated_data["share_ids"]
        card_last4 = serializer.validated_data["card_last4"]

        shares = list(
            ExpenseShare.objects.filter(
                id__in=share_ids,
                user=request.user,
                status__in=[ExpenseShare.Status.UNPAID, ExpenseShare.Status.REJECTED],
            ).select_related("expense")
        )
        if not shares:
            return Response(
                {"detail": "سهمی برای پرداخت پیدا نشد."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        found = {s.id for s in shares}
        missing = [i for i in share_ids if i not in found]
        if missing:
            return Response(
                {
                    "detail": "برخی سهم‌ها معتبر نیستند یا متعلق به شما نیستند.",
                    "invalid": missing,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payments = [
            Payment(
                share=share,
                amount=share.amount,
                card_last4=card_last4,
                submitted_by=request.user,
            )
            for share in shares
        ]
        Payment.objects.bulk_create(payments)
        ExpenseShare.objects.filter(id__in=found).update(
            status=ExpenseShare.Status.PENDING
        )

        total = sum(p.amount for p in payments)
        return Response(
            {
                "created": len(payments),
                "total": total,
                "card_last4": card_last4,
                "payments": PaymentSerializer(payments, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )



        try:
            share = ExpenseShare.objects.select_related("expense").get(
                pk=share_id
            )
        except ExpenseShare.DoesNotExist:
            return Response(
                {"detail": "سهم پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        if share.user_id != request.user.id and not request.user.is_admin_role:
            return Response(
                {"detail": "فقط صاحب سهم می‌تواند پرداخت را ثبت کند."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if share.status == ExpenseShare.Status.PAID:
            return Response(
                {"detail": "این سهم قبلاً پرداخت شده است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if share.status == ExpenseShare.Status.PENDING:
            return Response(
                {"detail": "پرداخت این سهم در انتظار تأیید مدیر است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment = Payment.objects.create(
            share=share,
            amount=share.amount,
            card_last4=serializer.validated_data["card_last4"],
            submitted_by=request.user,
        )
        share.status = ExpenseShare.Status.PENDING
        share.save(update_fields=["status"])
        return Response(PaymentSerializer(payment).data, status=201)


class PendingPaymentsView(generics.ListAPIView):
    """Admin: every payment waiting for a decision."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(status=Payment.Status.PENDING).select_related(
            "share__expense", "share__user", "submitted_by"
        )


class PaymentDecisionView(APIView):
    """Admin approves or rejects a pending payment."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, pk, action):
        try:
            payment = Payment.objects.select_related("share").get(pk=pk)
        except Payment.DoesNotExist:
            return Response(
                {"detail": "پرداخت پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        if payment.status != Payment.Status.PENDING:
            return Response(
                {"detail": "این پرداخت قبلاً بررسی شده است."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "approve":
            payment.status = Payment.Status.APPROVED
            payment.share.status = ExpenseShare.Status.PAID
        elif action == "reject":
            serializer = PaymentDecisionSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            payment.status = Payment.Status.REJECTED
            payment.reject_reason = serializer.validated_data.get("reject_reason", "")
            payment.share.status = ExpenseShare.Status.REJECTED
        else:
            return Response(
                {"detail": "عملیات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
            )

        payment.decided_at = timezone.now()
        payment.decided_by = request.user
        payment.save()
        payment.share.save(update_fields=["status"])

        if payment.status == Payment.Status.APPROVED:
            from common.jalali import fa_digits
            from schedule.models import Notification

            Notification.notify(
                payment.submitted_by,
                Notification.Kind.PAYMENT_APPROVED,
                (
                    f"پرداخت {fa_digits(f'{payment.amount:,}')} تومانی شما برای "
                    f"«{payment.share.expense.title}» تأیید شد."
                ),
                {"payment": payment.id},
            )

        return Response(PaymentSerializer(payment).data)


class MemberLedgerView(APIView):
    """Admin: per-member debt/credit ledger for the stats page."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        rows = []
        for user in User.objects.filter(
            is_active=True, is_superuser=False
        ).order_by("id"):
            shares = ExpenseShare.objects.filter(user=user)
            rows.append(
                {
                    "user": user.id,
                    "user_name": user.display_name,
                    "owed": sum(
                        s.amount
                        for s in shares
                        if s.status != ExpenseShare.Status.PAID
                    ),
                    "paid": sum(
                        s.amount
                        for s in shares
                        if s.status == ExpenseShare.Status.PAID
                    ),
                }
            )
        return Response(rows)


class MyWalletView(APIView):
    """Own wallet balance + recent transactions.

    Admins additionally receive every member's balance (see-all panel).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        payload = {
            "balance": wallet.balance,
            "transactions": WalletTransactionSerializer(
                wallet.transactions.order_by("-created_at")[:30], many=True
            ).data,
        }
        if request.user.is_admin_role:
            rows = []
            total = 0
            existing = {
                w.user_id: w.balance
                for w in Wallet.objects.filter(
                    user__is_active=True, user__is_superuser=False
                )
            }
            for u in User.objects.filter(
                is_active=True, is_superuser=False
            ).order_by("id"):
                balance = existing.get(u.id, 0)
                total += balance
                rows.append(
                    WalletSerializer(
                        Wallet(user=u, balance=balance)
                    ).data
                )
            payload["all"] = rows
            payload["all_total"] = total
        return Response(payload)


class AdminWalletTopupView(APIView):
    """Admin credits (positive) or corrects (negative) one member's wallet."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request):
        serializer = WalletTopupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            target = User.objects.get(
                pk=data["user_id"], is_active=True, is_superuser=False
            )
        except User.DoesNotExist:
            return Response(
                {"detail": "عضو پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )

        wallet, _ = Wallet.objects.get_or_create(user=target)
        new_balance = wallet.balance + data["amount"]
        if new_balance < 0:
            return Response(
                {"detail": "موجودی کیف پول منفی می‌شود."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        wallet.balance = new_balance
        wallet.save(update_fields=["balance", "updated_at"])
        WalletTransaction.objects.create(
            wallet=wallet,
            amount=data["amount"],
            kind=(
                WalletTransaction.Kind.TOPUP
                if data["amount"] > 0
                else WalletTransaction.Kind.ADJUST
            ),
            note=data.get("note") or "",
            created_by=request.user,
        )

        # Tell the member their wallet changed.
        from common.jalali import fa_digits
        from schedule.models import Notification

        sign = "+" if data["amount"] > 0 else ""
        amount_fa = fa_digits(f"{data['amount']:,}")
        balance_fa = fa_digits(f"{wallet.balance:,}")
        Notification.notify(
            target,
            Notification.Kind.ANNOUNCEMENT,
            (
                f"کیف پول شما {sign}{amount_fa} تومان "
                f"به‌روزرسانی شد؛ موجودی فعلی: {balance_fa} تومان."
            ),
            {"wallet": target.id},
        )
        return Response(
            {"user": target.id, "balance": wallet.balance}
        )


