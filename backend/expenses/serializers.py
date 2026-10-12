from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import Expense, ExpenseShare, Payment


class PaymentSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(
        source="submitted_by.display_name", read_only=True
    )
    decided_by_name = serializers.CharField(
        source="decided_by.display_name", read_only=True, default=None
    )
    created_at = serializers.DateTimeField(format="%Y-%m-%d %H:%M")

    class Meta:
        model = Payment
        fields = [
            "id",
            "share",
            "amount",
            "card_last4",
            "submitted_by",
            "submitted_by_name",
            "status",
            "created_at",
            "decided_at",
            "decided_by",
            "decided_by_name",
            "reject_reason",
        ]
        read_only_fields = fields


class ExpenseShareSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True)
    payment = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseShare
        fields = ["id", "expense", "user", "user_name", "amount", "status", "payment"]

    def get_payment(self, obj):
        latest = obj.payments.order_by("-created_at").first()
        return PaymentSerializer(latest).data if latest else None


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.display_name", read_only=True
    )
    shares = ExpenseShareSerializer(many=True, read_only=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%d %H:%M")
    created_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            "id",
            "title",
            "total_amount",
            "payer_name",
            "note",
            "created_by",
            "created_by_name",
            "created_at",
            "created_at_jalali",
            "shares",
        ]
        read_only_fields = ["id", "created_by", "created_at", "payer_name"]

    def get_created_at_jalali(self, obj):
        from common.jalali import jalali_datetime

        return jalali_datetime(obj.created_at)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        only_user = self.context.get("share_user")
        if only_user is not None:
            data["shares"] = [
                s for s in data["shares"] if s.get("user") == only_user.id
            ]
        return data


class ExpenseCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    total_amount = serializers.IntegerField(min_value=1000)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
    # Who paid: a roommate picked from the combo-box, or nothing → «مدیریت».
    payer_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default="مدیریت"
    )
    # Default: all active members; the client may remove some.
    member_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )

    def validate_payer_name(self, value):
        return (value or "").strip() or "مدیریت"

    def validate_member_ids(self, value):
        from accounts.models import User

        valid = set(
            User.objects.filter(
                is_active=True, is_superuser=False
            ).values_list("id", flat=True)
        )
        unknown = set(value) - valid
        if unknown:
            raise serializers.ValidationError("برخی اعضا معتبر نیستند.")
        if len(value) < 2:
            raise serializers.ValidationError("حداقل ۲ عضو برای تقسیم هزینه لازم است.")
        return sorted(set(value))


class PaymentCreateSerializer(serializers.Serializer):
    card_last4 = serializers.RegexField(
        regex=r"^\d{4}$",
        error_messages={"invalid": "۴ رقم آخر کارت را وارد کنید."},
    )


class PaymentDecisionSerializer(serializers.Serializer):
    reject_reason = serializers.CharField(
        max_length=255, required=False, allow_blank=True
    )
