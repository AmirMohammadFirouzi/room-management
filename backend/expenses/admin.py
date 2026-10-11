from django.contrib import admin

from .models import Expense, ExpenseShare, Payment


class ShareInline(admin.TabularInline):
    model = ExpenseShare
    extra = 0


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("title", "total_amount", "created_by", "created_at")
    inlines = [ShareInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "share",
        "amount",
        "card_last4",
        "status",
        "submitted_by",
        "created_at",
    )
    list_filter = ("status",)
