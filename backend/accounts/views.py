from django.contrib.auth import login, logout
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import (
    AdminUserCreateSerializer,
    AdminUserUpdateSerializer,
    LoginSerializer,
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


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response({"detail": "خارج شدید."})


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


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

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise permissions.PermissionDenied("امکان حذف حساب خودتان وجود ندارد.")
        instance.delete()
