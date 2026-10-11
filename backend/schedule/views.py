from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.views import IsAdminRole
from expenses.models import ExpenseShare, Payment
from expenses.serializers import PaymentSerializer

from .models import (
    Assignment,
    SiteSettings,
    SubstitutionCredit,
    SubstitutionRequest,
    WeeklySchedule,
    saturday_of,
)
from .scheduler import generate_schedule, next_week_start
from .serializers import (
    AssignmentSerializer,
    CreditSerializer,
    SiteSettingsSerializer,
    SubstitutionCreateSerializer,
    SubstitutionDecisionSerializer,
    SubstitutionRequestSerializer,
    WeeklyScheduleSerializer,
)


class SettingsView(APIView):
    """Members read; admin writes vacuum config and task toggles."""

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    def put(self, request):
        if not request.user.is_admin_role:
            return Response(
                {"detail": "فقط مدیر می‌تواند تنظیمات را تغییر دهد."}, status=403
            )
        serializer = SiteSettingsSerializer(
            SiteSettings.load(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        days = serializer.validated_data.get("vacuum_days", None)
        if days is not None:
            days = [int(d) for d in days]
            if any(d < 0 or d > 6 for d in days):
                raise ValidationError("روزها باید بین ۰ (شنبه) تا ۶ (جمعه) باشند.")
            serializer.validated_data["vacuum_days"] = sorted(set(days))
        serializer.save()
        return Response(serializer.data)


class ScheduleView(APIView):
    """GET ?week=YYYY-MM-DD returns that week's schedule (defaults to current)."""

    def get(self, request):
        week_param = request.query_params.get("week")
        if week_param:
            try:
                d = date.fromisoformat(week_param)
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
                )
            week_start = saturday_of(d)
        else:
            week_start = saturday_of(date.today())

        schedule = (
            WeeklySchedule.objects.filter(week_start=week_start)
            .prefetch_related(
                "assignments__assigned_to", "assignments__original_assignee"
            )
            .first()
        )
        if not schedule:
            return Response(
                {
                    "week_start": week_start.isoformat(),
                    "exists": False,
                    "assignments": [],
                }
            )
        data = WeeklyScheduleSerializer(schedule).data
        data["exists"] = True
        return Response(data)


class GenerateScheduleView(APIView):
    """Admin: build next week's (or ?week=) schedule; ``replace`` to redo."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request):
        week_param = request.data.get("week")
        if week_param:
            try:
                d = date.fromisoformat(week_param)
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
                )
        else:
            d = next_week_start()
        replace = bool(request.data.get("replace"))
        schedule = generate_schedule(d, request.user, replace=replace)
        return Response(
            WeeklyScheduleSerializer(schedule).data, status=status.HTTP_201_CREATED
        )


class MyAssignmentsView(APIView):
    """?week= or ?date= — feeds the dashboard and 'my tasks' page."""

    def get(self, request):
        week_param = request.query_params.get("week")
        date_param = request.query_params.get("date")
        qs = Assignment.objects.select_related("assigned_to", "original_assignee")
        if date_param:
            try:
                qs = qs.filter(date=date.fromisoformat(date_param))
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
                )
        elif week_param:
            try:
                week_start = saturday_of(date.fromisoformat(week_param))
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
                )
            qs = qs.filter(
                date__gte=week_start, date__lte=week_start + timedelta(days=6)
            )
        else:
            qs = qs.filter(date=date.today())
        if not request.user.is_admin_role:
            qs = qs.filter(assigned_to=request.user)
        return Response(AssignmentSerializer(qs, many=True).data)


class ConfirmAssignmentView(APIView):
    """The assigned person confirms they did the task."""

    def post(self, request, pk):
        try:
            assignment = Assignment.objects.get(pk=pk)
        except Assignment.DoesNotExist:
            return Response(
                {"detail": "تکلیف پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        allowed = (
            assignment.assigned_to_id == request.user.id or request.user.is_admin_role
        )
        if not allowed:
            return Response(
                {"detail": "فقط مسئول تکلیف می‌تواند آن را تأیید کند."}, status=403
            )
        if assignment.status == Assignment.Status.CONFIRMED:
            return Response({"detail": "این تکلیف قبلاً تأیید شده است."}, status=400)
        assignment.status = Assignment.Status.CONFIRMED
        assignment.confirmed_at = timezone.now()
        assignment.save(update_fields=["status", "confirmed_at"])
        return Response(AssignmentSerializer(assignment).data)


# ---------------------------------------------------------------------------
# Substitution system with inverse-replacement credit
# ---------------------------------------------------------------------------
class SubstitutionListCreateView(generics.ListCreateAPIView):
    """Members see their own requests; admins see all. Create = ask a
    replacement to cover one of your assignments."""

    serializer_class = SubstitutionRequestSerializer

    def get_queryset(self):
        qs = SubstitutionRequest.objects.select_related(
            "requested_by", "replacement", "decided_by", "assignment"
        )
        if self.request.user.is_admin_role and self.request.query_params.get("all"):
            return qs
        if self.request.user.is_admin_role:
            # Admin default: everything (approval queue lives here).
            return qs
        user = self.request.user
        return qs.filter(Q(requested_by=user) | Q(replacement=user))

    def create(self, request, *args, **kwargs):
        serializer = SubstitutionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            assignment = Assignment.objects.select_related("assigned_to").get(
                pk=data["assignment"]
            )
        except Assignment.DoesNotExist:
            return Response(
                {"detail": "تکلیف پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )

        # Only the current assignee (or admin) may request a replacement.
        if assignment.assigned_to_id != request.user.id and not request.user.is_admin_role:
            return Response(
                {"detail": "فقط مسئول تکلیف می‌تواند جایگزین درخواست کند."},
                status=403,
            )
        if assignment.status == Assignment.Status.CONFIRMED:
            return Response(
                {"detail": "این تکلیف تأیید شده و قابل جایگزینی نیست."},
                status=400,
            )
        if SubstitutionRequest.objects.filter(
            assignment=assignment, status=SubstitutionRequest.Status.PENDING
        ).exists():
            return Response(
                {"detail": "برای این تکلیف درخواست در انتظار وجود دارد."},
                status=400,
            )

        replacement_id = data["replacement"]
        if replacement_id == assignment.assigned_to_id:
            return Response(
                {"detail": "جایگزین باید فرد دیگری باشد."}, status=400
            )
        # The replacement must be free that day (unique person-per-day rule).
        if Assignment.objects.filter(
            date=assignment.date, assigned_to_id=replacement_id
        ).exists():
            return Response(
                {"detail": "جایگزین در این روز تکلیف دیگری دارد."}, status=400
            )

        request_obj = SubstitutionRequest.objects.create(
            assignment=assignment,
            requested_by=assignment.assigned_to,
            replacement_id=replacement_id,
            reason=data.get("reason", ""),
        )
        return Response(
            SubstitutionRequestSerializer(request_obj).data,
            status=status.HTTP_201_CREATED,
        )


class SubstitutionDecisionView(APIView):
    """Admin approves/rejects. On approval the inverse-credit ledger moves:

    - ``original`` (the person being covered) now owes ``replacement`` a
      favor → an *open* credit row is created.
    - If an open credit already exists in the opposite direction (the
      replacement owed the original), that row is settled instead — the two
      favors cancel out (true inverse replacement).
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, pk, action):
        try:
            req = SubstitutionRequest.objects.select_related(
                "assignment", "requested_by", "replacement"
            ).get(pk=pk)
        except SubstitutionRequest.DoesNotExist:
            return Response(
                {"detail": "درخواست پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        if req.status != SubstitutionRequest.Status.PENDING:
            return Response(
                {"detail": "این درخواست قبلاً بررسی شده است."}, status=400
            )

        if action == "reject":
            serializer = SubstitutionDecisionSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            req.status = SubstitutionRequest.Status.REJECTED
            req.reject_reason = serializer.validated_data.get("reject_reason", "")
            req.decided_at = timezone.now()
            req.decided_by = request.user
            req.save()
            return Response(SubstitutionRequestSerializer(req).data)

        if action != "approve":
            return Response(
                {"detail": "عملیات نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
            )

        original = req.requested_by
        replacement = req.replacement

        # Re-check availability at decision time (schedule may have changed).
        if Assignment.objects.filter(
            date=req.assignment.date, assigned_to=replacement
        ).exists():
            return Response(
                {"detail": "جایگزین در این روز تکلیف دیگری دارد."}, status=400
            )

        # --- inverse-credit bookkeeping -------------------------------
        opposite = SubstitutionCredit.objects.filter(
            debtor=replacement, creditor=original, settled_at__isnull=True
        ).first()
        if opposite:
            # Mutual favors cancel: replacement was owed by original.
            opposite.settled_at = timezone.now()
            opposite.settled_by = req
            opposite.save(update_fields=["settled_at", "settled_by"])
            credit_action = "settled"
        else:
            SubstitutionCredit.objects.create(
                debtor=original, creditor=replacement, created_by=req
            )
            credit_action = "created"

        # --- perform the swap ------------------------------------------
        assignment = req.assignment
        if assignment.original_assignee_id is None:
            assignment.original_assignee = assignment.assigned_to
        assignment.assigned_to = replacement
        assignment.save(update_fields=["original_assignee", "assigned_to"])

        req.status = SubstitutionRequest.Status.APPROVED
        req.decided_at = timezone.now()
        req.decided_by = request.user
        req.save()

        data = SubstitutionRequestSerializer(req).data
        data["credit_action"] = credit_action
        return Response(data)



class SubstitutionCandidatesView(APIView):
    """Replacement suggestions for one assignment, best-first:

    1. People with an open credit against the assignee (they owe a favor →
       settling here IS the inverse-replacement rule), then
    2. people with the fewest total tasks (overall fairness), excluding
       anyone already busy that day.
    """

    def get(self, request, assignment_id):
        try:
            assignment = Assignment.objects.select_related("assigned_to").get(
                pk=assignment_id
            )
        except Assignment.DoesNotExist:
            return Response(
                {"detail": "تکلیف پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        busy_ids = set(
            Assignment.objects.filter(date=assignment.date).values_list(
                "assigned_to_id", flat=True
            )
        )
        busy_ids.add(assignment.assigned_to_id)

        # Users who owe the assignee a favor (open credit: debtor→creditor).
        debtors_owing_assignee = set(
            SubstitutionCredit.objects.filter(
                creditor=assignment.assigned_to, settled_at__isnull=True
            ).values_list("debtor_id", flat=True)
        )

        candidates = []
        for user in User.objects.filter(
            is_active=True, is_superuser=False
        ).order_by("id"):
            if user.id in busy_ids:
                continue
            candidates.append(
                {
                    "user": user.id,
                    "display_name": user.display_name,
                    "avatar_text": user.avatar_text,
                    "owes_favor": user.id in debtors_owing_assignee,
                    "total_tasks": user.assignments.count(),
                }
            )
        candidates.sort(
            key=lambda c: (not c["owes_favor"], c["total_tasks"], c["user"])
        )
        return Response(candidates)


class CreditLedgerView(APIView):
    """My open inverse-replacement credits (both directions)."""

    def get(self, request):
        rows = CreditSerializer(
            SubstitutionCredit.objects.filter(settled_at__isnull=True).select_related(
                "debtor", "creditor"
            ),
            many=True,
        ).data
        return Response(
            {
                "i_owe": [r for r in rows if r["debtor"] == request.user.id],
                "owed_to_me": [r for r in rows if r["creditor"] == request.user.id],
            }
        )


# ---------------------------------------------------------------------------
# Dashboard + admin statistics
# ---------------------------------------------------------------------------
class DashboardView(APIView):
    """Everything the personal dashboard needs in one request."""

    def get(self, request):
        from datetime import date as _date

        from expenses.serializers import ExpenseSerializer

        today = _date.today()
        week_start = saturday_of(today)
        week_end = week_start + timedelta(days=6)
        user = request.user

        mine_week = Assignment.objects.filter(
            assigned_to=user, date__gte=week_start, date__lte=week_end
        ).select_related("assigned_to", "original_assignee")
        today_all = Assignment.objects.filter(date=today).select_related(
            "assigned_to", "original_assignee"
        )

        pending_subs = SubstitutionRequest.objects.filter(
            Q(requested_by=user) | Q(replacement=user),
            status=SubstitutionRequest.Status.PENDING,
        ).count()
        my_shares = ExpenseShare.objects.filter(user=user)
        pending_shares = my_shares.filter(
            status=ExpenseShare.Status.PENDING
        ).count()
        unpaid_shares = my_shares.exclude(status=ExpenseShare.Status.PAID)

        admin_queues = {}
        if user.is_admin_role:
            admin_queues = {
                "pending_substitutions": SubstitutionRequest.objects.filter(
                    status=SubstitutionRequest.Status.PENDING
                ).count(),
                "pending_payments": Payment.objects.filter(
                    status=Payment.Status.PENDING
                ).count(),
            }

        owed_total = sum(s.amount for s in my_shares)
        paid_total = sum(
            s.amount for s in my_shares if s.status == ExpenseShare.Status.PAID
        )

        return Response(
            {
                "today": AssignmentSerializer(today_all, many=True).data,
                "my_week": AssignmentSerializer(mine_week, many=True).data,
                "week_start": week_start.isoformat(),
                "balance": {
                    "owed_total": owed_total,
                    "paid_total": paid_total,
                    "unpaid_total": owed_total - paid_total,
                },
                "pending": {
                    "substitutions": pending_subs,
                    "payments": pending_shares,
                    "unconfirmed": mine_week.filter(
                        status=Assignment.Status.PENDING,
                        date__lt=today,
                    ).count(),
                    **admin_queues,
                },
                "schedule_exists": WeeklySchedule.objects.filter(
                    week_start=week_start
                ).exists(),
            }
        )


class StatsView(APIView):
    """Admin: simple fairness statistics + full history."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        members = list(
            User.objects.filter(
                is_active=True, is_superuser=False
            ).order_by("id")
        )
        per_member = []
        for m in members:
            qs = m.assignments
            per_member.append(
                {
                    "user": m.id,
                    "display_name": m.display_name,
                    "avatar_text": m.avatar_text,
                    "cleaning": qs.filter(task_type="cleaning").count(),
                    "vacuuming": qs.filter(task_type="vacuuming").count(),
                    "cooking": qs.filter(task_type="cooking").count(),
                    "total": qs.count(),
                    "confirmed": qs.filter(status="confirmed").count(),
                }
            )

        history = WeeklySchedule.objects.prefetch_related(
            "assignments__assigned_to"
        )[:12]
        from .serializers import WeeklyScheduleSerializer as WSS

        return Response(
            {
                "per_member": per_member,
                "history": WSS(history, many=True).data,
                "queues": {
                    "pending_substitutions": SubstitutionRequest.objects.filter(
                        status="pending"
                    ).count(),
                    "pending_payments": Payment.objects.filter(
                        status="pending"
                    ).count(),
                },
            }
        )


