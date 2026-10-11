from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "display_name", "role", "is_active")
    list_filter = ("role", "is_active")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("اطلاعات اتاق", {"fields": ("role", "display_name", "avatar_text")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("اطلاعات اتاق", {"fields": ("role", "display_name")}),
    )
