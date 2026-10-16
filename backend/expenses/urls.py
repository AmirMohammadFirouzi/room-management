from django.urls import path

from . import views

urlpatterns = [
    path("expenses/", views.ExpenseListCreateView.as_view(), name="expenses"),
    path(
        "expenses/<int:pk>/",
        views.ExpenseDetailView.as_view(),
        name="expense-detail",
    ),
    path("expenses/balance/", views.MyBalanceView.as_view(), name="my-balance"),
    path(
        "expenses/shares/<int:share_id>/pay/",
        views.SubmitPaymentView.as_view(),
        name="submit-payment",
    ),
    path(
        "expenses/shares/pay-bulk/",
        views.BulkPaymentView.as_view(),
        name="bulk-payment",
    ),
    path(
        "payments/pending/",
        views.PendingPaymentsView.as_view(),
        name="pending-payments",
    ),
    path(
        "payments/<int:pk>/<str:action>/",
        views.PaymentDecisionView.as_view(),
        name="payment-decision",
    ),
    path("ledger/", views.MemberLedgerView.as_view(), name="member-ledger"),
    path("wallet/", views.MyWalletView.as_view(), name="my-wallet"),
    path(
        "wallet/topup/",
        views.AdminWalletTopupView.as_view(),
        name="wallet-topup",
    ),
]
