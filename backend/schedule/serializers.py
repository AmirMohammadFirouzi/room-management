from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import Assignment, SiteSettings, SubstitutionCredit, SubstitutionRequest, WeeklySchedule


class AssignmentSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(
        source="assigned_to.display_name", read_only=True
    )
    assignee_avatar = serializers.CharField(
        source="assigned_to.avatar_text", read_only=True
    )
    original_assignee_name = serializers.CharField(
        source="original_assignee.display_name", read_only=True, default=None
    )
    task_label = serializers.CharField(
        source="get_task_type_display", read_only=True
    )
    weekday_label = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "schedule",
            "date",
            "weekday",
            "weekday_label",
            "task_type",
            "task_label",
            "assigned_to",
            "assignee_name",
            "assignee_avatar",
            "original_assignee",
            "original_assignee_name",
            "status",
            "confirmed_at",
        ]
        read_only_fields = fields

    def get_weekday_label(self, obj):
        from .models import WEEKDAY_LABELS

        return WEEKDAY_LABELS[obj.weekday]


class WeeklyScheduleSerializer(serializers.ModelSerializer):
    assignments = AssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = WeeklySchedule
        fields = ["id", "week_start", "created_at", "created_by", "assignments"]


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = [
            "vacuum_days",
            "vacuum_people",
            "cleaning_enabled",
            "vacuuming_enabled",
            "cooking_enabled",
        ]


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
            "decided_at",
            "decided_by",
            "decided_by_name",
            "reject_reason",
        ]
        read_only_fields = fields


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
