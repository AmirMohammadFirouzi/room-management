from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.SettingsView.as_view(), name="settings"),
    path("schedule/", views.ScheduleView.as_view(), name="schedule"),
    path(
        "schedule/generate/",
        views.GenerateScheduleView.as_view(),
        name="schedule-generate",
    ),
    path("assignments/", views.MyAssignmentsView.as_view(), name="assignments"),
    path(
        "assignments/<int:pk>/confirm/",
        views.ConfirmAssignmentView.as_view(),
        name="assignment-confirm",
    ),
    path(
        "assignments/<int:assignment_id>/candidates/",
        views.SubstitutionCandidatesView.as_view(),
        name="assignment-candidates",
    ),
    path(
        "substitutions/",
        views.SubstitutionListCreateView.as_view(),
        name="substitutions",
    ),
    path(
        "substitutions/<int:pk>/<str:action>/",
        views.SubstitutionDecisionView.as_view(),
        name="substitution-decision",
    ),
    path("credits/", views.CreditLedgerView.as_view(), name="credits"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("stats/", views.StatsView.as_view(), name="stats"),
]
