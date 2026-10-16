"""Wallet feature smoke check against db.sqlite3.

Run from the repo root:
    backend/.venv/Scripts/python.exe backend/verify_w.py
"""
import os
import sys

sys.stdout.reconfigure(errors="replace")
sys.stderr.reconfigure(errors="replace")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, "backend")
import django

django.setup()

from django.test import Client  # noqa: E402
from accounts.models import User  # noqa: E402
from expenses.models import Wallet  # noqa: E402

PAY = "application/json"


def show(label, response):
    print(label, "->", response.status_code, response.json())


def main():
    c = Client()
    tok = c.post("/api/auth/login/", {"username": "ali", "password": "room1234"},
                 content_type=PAY).json()["token"]
    ah = {"HTTP_AUTHORIZATION": "Token " + tok}
    rt = c.post("/api/auth/login/", {"username": "reza", "password": "room1234"},
                content_type=PAY).json()["token"]
    h2 = {"HTTP_AUTHORIZATION": "Token " + rt}
    reza = User.objects.get(username="reza")
    amir = User.objects.get(username="amir")

    up = c.post("/api/wallet/topup/", {"user_id": reza.id, "amount": 500000,
                                        "note": "seed"}, content_type=PAY, **ah)
    show("topup", up)

    rec = c.post("/api/expenses/", {
        "title": "T", "total_amount": 100000,
        "member_ids": [reza.id, amir.id], "pay_from_wallet": True,
    }, content_type=PAY, **ah)
    print("expense-wallet ->", rec.status_code)
    for s in rec.json()["shares"]:
        print("  share", s["user_name"], s["amount"], s["status"])
    bal = c.get("/api/wallet/", **ah).json()
    print("wallet balance after:", bal["balance"], "tx:", len(bal["transactions"]))
    t0 = Wallet.objects.filter(user=reza).first()
    if t0:
        print("reza tx:", [x.amount for x in t0.transactions.all()])

    no = c.post("/api/expenses/", {
        "title": "big", "total_amount": 9000000,
        "member_ids": [reza.id, amir.id], "pay_from_wallet": True,
    }, content_type=PAY, **ah)
    print("insufficient:", no.status_code)

    me = c.get("/api/wallet/", **h2).json()
    print("member sees all flag:", "all" in me, "own balance:", me["balance"])

    adm = c.get("/api/wallet/", **ah).json()
    print("admin entries:", len(adm["all"]), "total:", adm["all_total"])
    r3 = c.get("/api/wallet/", **h2).json()
    print("reza balance:", r3["balance"], "tx:", len(r3["transactions"]))


if __name__ == "__main__":
    main()
