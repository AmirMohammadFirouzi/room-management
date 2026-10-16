from rest_framework import serializers

from accounts.serializers import UserSerializer
from common.jalali import jalali_date, jalali_datetime

from .models import (
    Assignment,
    Notification,
    SiteSettings,
    SubstitutionCredit,
    SubstitutionRequest,
    WeeklySchedule,
)


class AssignmentSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(
        source="assigned_to.display_name", read_only=True
    )
    assignee_avatar = serializers.CharField(
        source="assigned_to.avatar_text", read_only=True
    )
    assignee_color = serializers.CharField(
        source="assigned_to.avatar_bg", read_only=True
    )
    assignee_image = serializers.CharField(
        source="assigned_to.avatar_image", read_only=True
    )
    original_assignee_name = serializers.CharField(
        source="original_assignee.display_name", read_only=True, default=None
    )
    task_label = serializers.CharField(
        source="get_task_type_display", read_only=True
    )
    weekday_label = serializers.SerializerMethodField()
    is_substituted = serializers.SerializerMethodField()
    date_jalali = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "schedule",
            "date",
            "date_jalali",
            "weekday",
            "weekday_label",
            "task_type",
            "task_label",
            "assigned_to",
            "assignee_name",
            "assignee_avatar",
            "assignee_color",
            "assignee_image",
            "original_assignee",
            "original_assignee_name",
            "is_substituted",
            "status",
            "confirmed_at",
        ]
        read_only_fields = fields

    def get_weekday_label(self, obj):
        from .models import WEEKDAY_LABELS

        return WEEKDAY_LABELS[obj.weekday]

    def get_is_substituted(self, obj):
        return obj.is_substituted

    def get_date_jalali(self, obj):
        return jalali_date(obj.date, weekday=True)


class WeeklyScheduleSerializer(serializers.ModelSerializer):
    assignments = AssignmentSerializer(many=True, read_only=True)
    week_start_jalali = serializers.SerializerMethodField()
    created_at_jalali = serializers.SerializerMethodField()
    published_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = WeeklySchedule
        fields = [
            "id",
            "week_start",
            "week_start_jalali",
            "created_at",
            "created_at_jalali",
            "created_by",
            "schedule_status",
            "published_at",
            "published_at_jalali",
            "assignments",
        ]

    def get_week_start_jalali(self, obj):
        return jalali_date(obj.week_start, weekday=True)

    def get_created_at_jalali(self, obj):
        return jalali_datetime(obj.created_at)

    def get_published_at_jalali(self, obj):
        return jalali_datetime(obj.published_at) if obj.published_at else None


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = [
            "site_title",
            "site_logo",
            "site_logo_image",
            "bank_name",
            "bank_logo",
            "bank_logo_image",
            "brand_color",
            "card_number",
            "card_holder",
            "vacuum_days",
            "vacuum_people",
            "cooking_days",
            "cooking_people",
            "cleaning_enabled",
            "vacuuming_enabled",
            "cooking_enabled",
        ]

    def _clean_days(self, value, label: str):
        try:
            days = [int(d) for d in value]
        except (TypeError, ValueError):
            raise serializers.ValidationError(f"{label} باید اعداد ۰ تا ۶ باشند.")
        if any(d < 0 or d > 6 for d in days):
            raise serializers.ValidationError(
                f"{label} باید بین ۰ (شنبه) تا ۶ (جمعه) باشند."
            )
        return sorted(set(days))

    def validate_vacuum_days(self, value):
        return self._clean_days(value, "روزهای جاروبرقی")

    def validate_cooking_days(self, value):
        return self._clean_days(value, "روزهای آشپزی")

    def validate_card_number(self, value):
        digits = "".join(ch for ch in str(value) if ch.isdigit())
        if len(digits) != 16:
            raise serializers.ValidationError("شماره کارت باید ۱۶ رقم باشد.")
        return digits

    def validate_card_holder(self, value):
        return str(value).strip() or "اتاق مشترک"


class NotificationSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    created_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "kind_label",
            "title",
            "description",
            "message",
            "data",
            "is_read",
            "created_at",
            "created_at_jalali",
        ]
        read_only_fields = fields

    def get_created_at_jalali(self, obj):
        return jalali_datetime(obj.created_at)


class SubstitutionRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(
        source="requested_by.display_name", read_only=True
    )
    replacement_name = serializers.CharField(
        source="replacement.display_name", read_only=True
    )
    decided_by_name = serializers.CharField(
        source="decided_by.display_name", read_only=True, default=None
    )
    assignment_detail = AssignmentSerializer(source="assignment", read_only=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%d %H:%M")
    created_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = SubstitutionRequest
        fields = [
            "id",
            "assignment",
            "assignment_detail",
            "requested_by",
            "requested_by_name",
            "replacement",
            "replacement_name",
            "reason",
            "status",
            "created_at",
            "created_at_jalali",
            "decided_at",
            "decided_by",
            "decided_by_name",
            "reject_reason",
        ]
        read_only_fields = fields

    def get_created_at_jalali(self, obj):
        return jalali_datetime(obj.created_at)


class SubstitutionCreateSerializer(serializers.Serializer):
    assignment = serializers.IntegerField()
    replacement = serializers.IntegerField()
    reason = serializers.CharField(
        max_length=255, required=False, allow_blank=True
    )


class SubstitutionDecisionSerializer(serializers.Serializer):
    reject_reason = serializers.CharField(
        max_length=255, required=False, allow_blank=True
    )


class AnnouncementSerializer(serializers.Serializer):
    """Admin broadcasts a message to everyone or a selected subset."""

    message = serializers.CharField(max_length=400)
    # Empty/omitted → everyone; otherwise a list of user ids.
    user_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )


class CreditSerializer(serializers.ModelSerializer):
    debtor_name = serializers.CharField(source="debtor.display_name", read_only=True)
    creditor_name = serializers.CharField(
        source="creditor.display_name", read_only=True
    )

    class Meta:
        model = SubstitutionCredit
        fields = [
            "id",
            "debtor",
            "debtor_name",
            "creditor",
            "creditor_name",
            "created_at",
            "settled_at",
        ]
        read_only_fields = fields
