from django.urls import path

from . import views

urlpatterns = [
    path("expenses/", views.ExpenseListCreateView.as_view(), name="expenses"),
    path("expenses/balance/", views.MyBalanceView.as_view(), name="my-balance"),
    path(
        "expenses/shares/<int:share_id>/pay/",
        views.SubmitPaymentView.as_view(),
        name="submit-payment",
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
]
