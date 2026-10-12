from django.urls import path

from . import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("members/", views.MemberListCreateView.as_view(), name="members"),
    path("members/<int:pk>/", views.MemberDetailView.as_view(), name="member-detail"),
]
