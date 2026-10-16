from django.contrib.auth import login, logout
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import (
    AdminUserCreateSerializer,
    AdminUserUpdateSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


class IsAdminRole(permissions.BasePermission):
    """Only users with the admin role may pass."""

    message = "فقط مدیر می‌تواند این عملیات را انجام دهد."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_admin_role
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        login(request, user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class RegisterView(APIView):
    """Anyone may sign up, but always as a plain member."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        login(request, user)
        _send_welcome(user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


def _send_welcome(user) -> None:
    """Drop a welcome message into the new member's inbox."""
    from schedule.models import Notification

    Notification.notify(
        user,
        Notification.Kind.WELCOME,
        (
            f"به اتاق مشترک خوش آمدی {user.display_name}! 🎉 "
            "برنامه‌ی هفتگی، جایگزینی و دنگ همین‌جا مدیریت می‌شود."
        ),
        {"user": user.id},
    )


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response({"detail": "خارج شدید."})


class MeView(APIView):
    """Read my profile (GET) or edit my own username/password (PATCH)."""

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)


class MemberListCreateView(generics.ListCreateAPIView):
    """GET: every member (needed for substitution/expense pickers).
    POST: admin only — create one of the roommates."""

    queryset = User.objects.filter(is_superuser=False).order_by("id")
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AdminUserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        _send_welcome(user)


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin manages roommates; members may read. Admin cannot delete self."""

    queryset = User.objects.filter(is_superuser=False)
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return AdminUserUpdateSerializer
        return UserSerializer

    def perform_update(self, serializer):
        # The admin may not lock or demote their own account.
        instance = serializer.instance
        if instance is not None and instance == self.request.user:
            if instance.is_active and not self.request.data.get("is_active", True):
                raise PermissionDenied(
                    "امکان غیرفعال کردن حساب خودتان وجود ندارد."
                )
            if instance.is_admin_role and self.request.data.get("role") == "member":
                raise PermissionDenied(
                    "امکان کم کردن دسترسی خودتان وجود ندارد."
                )
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise PermissionDenied("امکان حذف حساب خودتان وجود ندارد.")
        instance.delete()
