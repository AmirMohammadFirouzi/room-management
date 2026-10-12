from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.BooleanField(source="is_admin_role", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "display_name",
            "avatar_text",
            "role",
            "is_admin",
            "is_active",
            "first_name",
            "last_name",
        ]
        read_only_fields = ["id"]


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Admin creates roommates: username, password, display name, role."""

    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ["id", "username", "password", "display_name", "role", "is_active"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "username", "password", "display_name", "role", "is_active"]

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, attrs):
        user = authenticate(
            username=attrs["username"], password=attrs["password"]
        )
        if user is None:
            raise serializers.ValidationError("نام کاربری یا رمز عبور اشتباه است.")
        if not user.is_active:
            raise serializers.ValidationError("حساب کاربری غیرفعال است.")
        attrs["user"] = user
        return attrs


class RegisterSerializer(serializers.ModelSerializer):
    """Self sign-up: everyone registers as a plain member (never an admin)."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "password", "display_name"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("نام کاربری را وارد کنید.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("این نام کاربری قبلاً گرفته شده است.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User(
            username=validated_data["username"],
            display_name=validated_data.get("display_name", ""),
            role=User.Role.MEMBER,
        )
        user.set_password(validated_data["password"])
        user.save()
        return user


class MeUpdateSerializer(serializers.ModelSerializer):
    """A user edits their own profile: username and/or password.

    Changing the password requires the current one; everything else is free.
    """

    current_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=8
    )

    class Meta:
        model = User
        fields = ["username", "display_name", "password", "current_password"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("نام کاربری را وارد کنید.")
        clash = User.objects.filter(username__iexact=value).exclude(
            pk=self.instance.pk
        )
        if clash.exists():
            raise serializers.ValidationError("این نام کاربری قبلاً گرفته شده است.")
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            current = attrs.get("current_password") or ""
            if not self.instance.check_password(current):
                raise serializers.ValidationError(
                    {"current_password": "رمز عبور فعلی اشتباه است."}
                )
            validate_password(password)
        elif "password" in attrs:
            attrs.pop("password", None)
        attrs.pop("current_password", None)
        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
