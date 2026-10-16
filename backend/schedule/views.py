from datetime import date, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.views import IsAdminRole
from common.jalali import jalali_date
from expenses.models import ExpenseShare, Payment
from expenses.serializers import PaymentSerializer

from .models import (
    Assignment,
    Notification,
    ScheduleStatus,
    SiteSettings,
    SubstitutionCredit,
    SubstitutionRequest,
    WeeklySchedule,
    persian_weekday,
    saturday_of,
)
from .scheduler import generate_schedule, next_week_start
from .serializers import (
    AnnouncementSerializer,
    AssignmentSerializer,
    CreditSerializer,
    NotificationSerializer,
    SiteSettingsSerializer,
    SubstitutionCreateSerializer,
    SubstitutionDecisionSerializer,
    SubstitutionRequestSerializer,
    WeeklyScheduleSerializer,
)


class SettingsView(APIView):
    """Members read; admin writes task config, branding and the bank card."""

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
        serializer.save()
        return Response(serializer.data)


class PublicSiteView(APIView):
    """Branding for the login page (no authentication required)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        s = SiteSettings.load()
        return Response(
            {
                "site_title": s.site_title,
                "site_logo": s.site_logo,
                "site_logo_image": s.site_logo_image,
                "allow_registration": True,
            }
        )


class ScheduleView(APIView):
    """GET ?week=YYYY-MM-DD returns that week's schedule (defaults to current).

    Drafts are visible to admins only — until the admin publishes, the week is
    not active for regular members (``exists: false`` + ``schedule_status``).
    """

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
                    "schedule_status": None,
                    "assignments": [],
                }
            )

        is_draft = schedule.schedule_status == ScheduleStatus.DRAFT
        if is_draft and not request.user.is_admin_role:
            # Not published yet → the week is not active for regular members.
            return Response(
                {
                    "week_start": week_start.isoformat(),
                    "exists": False,
                    "schedule_status": ScheduleStatus.DRAFT,
                    "assignments": [],
                }
            )

        data = WeeklyScheduleSerializer(schedule).data
        data["exists"] = True
        return Response(data)


class GenerateScheduleView(APIView):
    """Admin: build next week's (or ?week=) schedule — it starts as a draft."""

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


class PublishScheduleView(APIView):
    """Admin: publish a draft → it becomes active and everyone is notified.

    Notifications are upserted per user (one row per kind), so publishing
    several consecutive weeks refreshes a single general notification instead
    of stacking duplicates.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request):
        week_param = request.data.get("week")
        if week_param:
            try:
                week_start = saturday_of(date.fromisoformat(week_param))
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST
                )
        else:
            week_start = saturday_of(date.today())

        schedule = WeeklySchedule.objects.filter(week_start=week_start).first()
        if not schedule:
            return Response(
                {"detail": "برای این هفته برنامه‌ای ساخته نشده است."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if schedule.schedule_status == ScheduleStatus.PUBLISHED:
            return Response(
                {"detail": "این برنامه قبلاً منتشر شده است."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.schedule_status = ScheduleStatus.PUBLISHED
        schedule.published_at = timezone.now()
        schedule.save(update_fields=["schedule_status", "published_at"])

        message = (
            f"برنامه‌ی هفته‌ی {jalali_date(week_start, weekday=True)} منتشر شد؛ "
            "کارهای خود را در «برنامه» ببینید."
        )
        Notification.notify_many(
            User.objects.filter(is_active=True, is_superuser=False),
            Notification.Kind.WEEK_SCHEDULE_PUBLISHED,
            message,
            {"week_start": week_start.isoformat()},
        )

        return Response(WeeklyScheduleSerializer(schedule).data)


class MoveAssignmentView(APIView):
    """Admin: freely move a task to another person and/or date.

    Used by the «ساخت برنامه این هفته» editor while the schedule is still a
    draft. Confirmed (already done) tasks are locked.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        try:
            assignment = Assignment.objects.select_related("schedule").get(pk=pk)
        except Assignment.DoesNotExist:
            return Response(
                {"detail": "تکلیف پیدا نشد."}, status=status.HTTP_404_NOT_FOUND
            )
        if assignment.status == Assignment.Status.CONFIRMED:
            return Response(
                {"detail": "تکلیف انجام‌شده قابل جابه‌جایی نیست."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_user_id = request.data.get("assigned_to")
        new_date = request.data.get("date")
        if new_user_id is None and new_date is None:
            return Response(
                {"detail": "چیزی برای جابه‌جایی ارسال نشده است."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_date = assignment.date
        if new_date is not None:
            try:
                target_date = date.fromisoformat(str(new_date))
            except ValueError:
                return Response(
                    {"detail": "تاریخ نامعتبر است."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            week = assignment.schedule
            if not (week.week_start <= target_date <= week.week_end):
                return Response(
                    {"detail": "تاریخ باید داخل همین هفته باشد."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        target_user = assignment.assigned_to
        if new_user_id is not None:
            try:
                target_user = User.objects.get(
                    pk=int(new_user_id), is_active=True, is_superuser=False
                )
            except (User.DoesNotExist, TypeError, ValueError):
                return Response(
                    {"detail": "عضو انتخاب‌شده معتبر نیست."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Integrity: nobody may hold two tasks on the same day (unless this
        # very assignment is simply staying put).
        clash = Assignment.objects.filter(
            date=target_date, assigned_to=target_user
        ).exclude(pk=assignment.pk)
        if clash.exists():
            return Response(
                {"detail": f"{target_user.display_name} در این روز تکلیف دیگری دارد."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assignment.assigned_to = target_user
        assignment.date = target_date
        assignment.weekday = persian_weekday(target_date)
        assignment.save(update_fields=["assigned_to", "date", "weekday"])

        return Response(AssignmentSerializer(assignment).data)


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
        # "Mark as done" only becomes available on the exact day of the task.
        # (An admin may still correct a record on any day.)
        if (
            assignment.assigned_to_id == request.user.id
            and assignment.date != date.today()
        ):
            return Response(
                {"detail": "فقط در روز خودِ تکلیف می‌توانید آن را تأیید کنید."},
                status=400,
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
            Notification.notify(
                req.requested_by,
                Notification.Kind.SUB_REJECTED,
                (
                    f"درخواست جایگزینی شما برای "
                    f"{jalali_date(req.assignment.date, weekday=True)} رد شد."
                    + (f" دلیل: {req.reject_reason}" if req.reject_reason else "")
                ),
                {"substitution": req.id},
            )
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
# Notifications (the Messages box + live badge counter)
# ---------------------------------------------------------------------------
class NotificationsView(APIView):
    """My notifications, newest first, plus the unread count for the badge."""

    def get(self, request):
        mine = Notification.objects.filter(user=request.user)
        return Response(
            {
                "unread_count": mine.filter(is_read=False).count(),
                "items": NotificationSerializer(mine[:50], many=True).data,
            }
        )


class MarkNotificationsReadView(APIView):
    """Mark every notification (or just the given ids) as read."""

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, is_read=False)
        ids = request.data.get("ids")
        if isinstance(ids, list) and ids:
            qs = qs.filter(id__in=ids)
        updated = qs.update(is_read=True)
        remaining = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"updated": updated, "unread_count": remaining})


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

        # A draft week is not active for regular members yet.
        week_schedule = WeeklySchedule.objects.filter(week_start=week_start).first()
        schedule_status = week_schedule.schedule_status if week_schedule else None
        draft_hidden = (
            week_schedule is not None
            and schedule_status == ScheduleStatus.DRAFT
            and not user.is_admin_role
        )
        if draft_hidden:
            mine_week = Assignment.objects.none()
            today_all = Assignment.objects.none()

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
                "notifications_unread": Notification.objects.filter(
                    user=user, is_read=False
                ).count(),
                "schedule_exists": week_schedule is not None and not draft_hidden,
                "schedule_status": schedule_status,
            }
        )


class AnnouncementView(APIView):
    """Admin broadcasts a message to every member or a selected subset.

    Each recipient gets their own inbox row (history is kept), unlike the
    schedule-publish notification which intentionally collapses to one entry.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request):
        title = request.data.get("title", "").strip()
        if not title:
            return Response(
                {"detail": "عنوان اعلان الزامی است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        description = request.data.get("description", "").strip()
        message = request.data.get("message", "").strip()
        if not message:
            return Response(
                {"detail": "متن اعلان الزامی است."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AnnouncementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data["message"].strip()
        user_ids = serializer.validated_data.get("user_ids") or []

        users = User.objects.filter(is_active=True, is_superuser=False)
        if user_ids:
            users = users.filter(id__in=user_ids)
        users = list(users)

        payload = {
            "title": title,
            "description": description or message,
            "message": message,
        }
        Notification.objects.bulk_create(
            [
                Notification(
                    user=u,
                    kind=Notification.Kind.ANNOUNCEMENT,
                    title=title,
                    description=description or message,
                    message=message,
                    data={"admin": request.user.id, "title": title},
                )
                for u in users
            ]
        )
        return Response(
            {"sent": len(users), "title": title, "payload": payload}
        )


class StatsView(APIView):
    """Admin: fairness statistics, history **and** the full financial picture
    (total expenses + every invoice)."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from django.db.models import Sum

        from expenses.models import Expense
        from expenses.serializers import ExpenseSerializer

        members = list(
            User.objects.filter(
                is_active=True, is_superuser=False
            ).order_by("id")
        )
        per_member = []
        for m in members:
            qs = m.assignments
            shares = list(ExpenseShare.objects.filter(user=m))
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
                    "share_total": sum(s.amount for s in shares),
                    "share_paid": sum(
                        s.amount
                        for s in shares
                        if s.status == ExpenseShare.Status.PAID
                    ),
                    "share_due": sum(
                        s.amount
                        for s in shares
                        if s.status != ExpenseShare.Status.PAID
                    ),
                }
            )

        history = WeeklySchedule.objects.prefetch_related(
            "assignments__assigned_to"
        )[:12]
        from .serializers import WeeklyScheduleSerializer as WSS

        # --- financials: total expenses + full invoice list ----------------
        total_spent = (
            Expense.objects.aggregate(v=Sum("total_amount"))["v"] or 0
        )
        total_paid = (
            ExpenseShare.objects.filter(status=ExpenseShare.Status.PAID).aggregate(
                v=Sum("amount")
            )["v"]
            or 0
        )
        total_pending = (
            ExpenseShare.objects.filter(
                status=ExpenseShare.Status.PENDING
            ).aggregate(v=Sum("amount"))["v"]
            or 0
        )
        invoices = Expense.objects.prefetch_related("shares__user", "shares__payments")[
            :200
        ]

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
                "financial": {
                    "total_spent": total_spent,
                    "total_paid": total_paid,
                    "total_pending": total_pending,
                    "total_unpaid": total_spent - total_paid,
                    "invoice_count": Expense.objects.count(),
                },
                "invoices": ExpenseSerializer(invoices, many=True).data,
            }
        )


