from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.views import IsAdminRole

from .models import Expense, ExpenseShare, Payment
from .serializers import (
    ExpenseCreateSerializer,
    ExpenseSerializer,
    PaymentCreateSerializer,
    PaymentDecisionSerializer,
    PaymentSerializer,
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
        expense = Expense.objects.create(
            title=data["title"],
            total_amount=data["total_amount"],
            note=data.get("note", ""),
            created_by=request.user,
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
        return Response(
            ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED
        )


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

