from django.contrib import admin

from .models import (
    Assignment,
    SiteSettings,
    SubstitutionCredit,
    SubstitutionRequest,
    WeeklySchedule,
)


@admin.register(WeeklySchedule)
class WeeklyScheduleAdmin(admin.ModelAdmin):
    list_display = ("week_start", "created_at", "created_by")
    list_filter = ("week_start",)


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("date", "task_type", "assigned_to", "status")
    list_filter = ("task_type", "status", "date")
    search_fields = ("assigned_to__username", "assigned_to__display_name")


@admin.register(SubstitutionRequest)
class SubstitutionRequestAdmin(admin.ModelAdmin):
    list_display = (
        "assignment",
        "requested_by",
        "replacement",
        "status",
        "created_at",
    )
    list_filter = ("status",)


@admin.register(SubstitutionCredit)
class SubstitutionCreditAdmin(admin.ModelAdmin):
    list_display = ("debtor", "creditor", "created_at", "settled_at")
    list_filter = ("settled_at",)


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "vacuum_people",
        "cleaning_enabled",
        "vacuuming_enabled",
        "cooking_enabled",
    )
