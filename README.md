# مدیریت اتاق مشترک (Room Management)

یک وب‌اپلیکیشن ساده، کم‌حجم و عملیاتی برای مدیریت کارهای مشترک یک اتاق ۸ نفره‌ی
خوابگاه با رابط کاربری کاملاً فارسی و راست‌چین، پشتیبانی PWA و تاریخ شمسی.

> گزارش کامل پروژه (مراحل انجام‌شده، راه‌اندازی قدم‌به‌قدم، راهنمای استفاده و
> عیب‌یابی) در [docs/REPORT.md](docs/REPORT.md) قرار دارد.

## امکانات

- برنامه‌ی هفتگی منصفانه و خودکار: نظافت (هر روز، هر نفر حداکثر یک بار در هفته)، جاروبرقی (قابل تنظیم توسط ادمین؛ پیش‌فرض دوشنبه/چهارشنبه/جمعه، ۲ نفر)، آشپزی (پنجشنبه و جمعه، ۲ نفر)
- سیستم جایگزینی با منطق اعتبار معکوس (اگر رضا جای علی را بگیرد، علی برای جبران ترجیح داده می‌شود)
- تأیید انجام کار توسط شخصِ مسئول
- مدیریت هزینه‌ها (دنگ): ثبت آیتم، تقسیم بین اعضا، پرداخت کارت‌به‌کارت و تأیید/رد توسط ادمین
- داشبورد شخصی و پنل ادمین مجزا
- تم روشن/تاریک، اعلان‌های Toast و نشان‌ها (Badge)

## ساختار پروژه

```text
room_management/
├── backend/        # Django + DRF + SQLite (بدون Redis/Celery/Postgres)
│   ├── config/     # settings فارسی (Asia/Tehran)، urls، wsgi
│   ├── accounts/   # کاربر سفارشی با دو نقش admin/member + API ورود
│   ├── schedule/   # برنامه هفتگی، الگوریتم منصفانه، جایگزینی + اعتبار معکوس
│   ├── expenses/   # دنگ: آیتم، سهم، پرداخت کارت‌به‌کارت با تأیید ادمین
│   └── requirements.txt
└── frontend/       # React + Vite + TS + Tailwind v4 + VibeFarsi + PWA
    ├── public/icons/
    └── src/ (pages، components/ui، lib/jalali.ts)
```

## مدل‌ها و طراحی دیتابیس

| مدل | نقش |
| --- | --- |
| `accounts.User` | کاربر با `role` (مدیر/عضو)، `display_name` و `avatar_text` |
| `schedule.SiteSettings` | سطر تکی: روزهای جاروبرقی، تعداد نفرات، فعال/غیرفعال بودن سه کار |
| `schedule.WeeklySchedule` | یک برنامه برای هفته‌ای که با شنبه شروع می‌شود (`week_start` یکتا) |
| `schedule.Assignment` | یک تکلیف: تاریخ + نوع کار + مسئول (+ مسئول اولیه، وضعیت تأیید). قید `(date, assigned_to)` یعنی هیچ‌کس دو کار در یک روز ندارد |
| `schedule.SubstitutionRequest` | درخواست جایگزینی (در انتظار/تأیید/رد) با تصمیم‌گیرنده و دلیل |
| `schedule.SubstitutionCredit` | دفتر اعتبار معکوس: بدهکار/طلبکار + مبدأ و تسویه‌کننده |
| `expenses.Expense` | آیتم با مبلغ کل (تومان) و ثبت‌کننده |
| `expenses.ExpenseShare` | سهم هر عضو (تقسیم مساوی، باقی‌مانده به نفرات اول) با وضعیت پرداخت |
| `expenses.Payment` | ادعای پرداخت کارت‌به‌کارت: ۴ رقم آخر کارت + تأیید/رد ادمین |

## قوانین زمان‌بندی (الگوریتم منصفانه)

شنبه = ۰ تا جمعه = ۶. روزها از شلوغ‌ترین (جمعه) پر می‌شوند:

1. **نظافت:** هر روز ۱ نفر، شنبه تا جمعه؛ با ۷+ عضو فعال هیچ‌کس دو بار نظافت ندارد.
2. **جاروبرقی:** روزهای قابل تنظیم ادمین (پیش‌فرض دوشنبه/چهارشنبه/جمعه) × تعداد نفر قابل تنظیم.
3. **آشپزی:** پنجشنبه و جمعه، هر روز ۲ نفر.
4. **سخت‌گیرانه:** حداکثر یک تکلیف برای هر نفر در هر روز (محافظ جمعه).
5. **نرم (امتیازدهی):** سابقه بلندمدت هر نوع کار، ۴ هفته اخیر، تکرار هفته قبل، هم‌روز هفته قبل، بار هفته جاری + چرخش قطعی برای تساوی امتیازها.

## جایگزینی و اعتبار معکوس

1. مسئول (یا ادمین) برای یک تکلیف تأییدنشده، جایگزینِ آزادِ آن روز را انتخاب می‌کند.
2. ادمین تأیید/رد می‌کند. با تأیید، `assigned_to` عوض و `original_assignee` حفظ می‌شود.
3. اگر جایگزین قبلاً به مسئول اولیه بدهکار بود، آن اعتبار **تسویه** می‌شود؛ وگرنه اعتبار باز جدید ثبت می‌شود (مسئول اولیه بدهکار، جایگزین طلبکار).
4. پیشنهاد نامزدها: اول بدهکاران (تسویه اعتبار)، بعد کم‌کارترین‌ها.

## دنگ و پرداخت

1. ثبت آیتم + مبلغ کل؛ تقسیم مساوی بین اعضا (پیش‌فرض همه فعال‌ها، قابل حذف).
2. هر عضو پس از کارت‌به‌کارت، ۴ رقم آخر کارت را ثبت می‌کند و سهم `pending` می‌شود.
3. ادمین تأیید (`paid`) یا رد (`rejected` با دلیل) می‌کند. بدون درگاه پرداخت.

## APIها (پیشوند `/api/`)

| متد | مسیر | دسترسی |
| --- | --- | --- |
| POST | `auth/login/` ،`auth/logout/` | همگانی / لاگین‌کرده |
| GET | `auth/me/` | لاگین‌کرده |
| GET/POST | `members/` | خواندن همه؛ ساخت فقط ادمین |
| PATCH/DELETE | `members/<id>/` | فقط ادمین |
| GET/PUT | `settings/` | خواندن همه؛ نوشتن فقط ادمین |
| GET | `schedule/?week=YYYY-MM-DD` | لاگین‌کرده |
| POST | `schedule/generate/` (`week`، `replace`) | فقط ادمین |
| GET | `assignments/?week=` یا `?date=` | لاگین‌کرده (اعضا: فقط خودشان) |
| POST | `assignments/<id>/confirm/` | مسئول تکلیف یا ادمین |
| GET | `assignments/<id>/candidates/` | لاگین‌کرده |
| GET/POST | `substitutions/` | شخصی (ادمین: همه) / ثبت درخواست |
| POST | `substitutions/<id>/approve/` ،`.../reject/` | فقط ادمین |
| GET | `credits/` | اعتبارهای باز من |
| GET | `dashboard/` | داشبورد شخصی |
| GET | `stats/` | فقط ادمین |
| GET/POST | `expenses/` | لاگین‌کرده |
| GET | `expenses/balance/` | خلاصه بدهی من |
| POST | `expenses/shares/<id>/pay/` (`card_last4`) | صاحب سهم |
| GET | `payments/pending/` | فقط ادمین |
| POST | `payments/<id>/approve/` ،`.../reject/` | فقط ادمین |
| GET | `ledger/` | فقط ادمین |

## فرانت‌اند (فارسی، راست‌چین، PWA)

- صفحات عضو: داشبورد (وظایف امروز، هفته من، بدهی، در انتظار، امروز در اتاق)، برنامه هفتگی (۷ کارت شمسی + دیالوگ جایگزینی)، جایگزینی‌ها (دفتر اعتبار + درخواست‌ها)، هزینه‌ها (ثبت دنگ + پرداخت ۴ رقم).
- صفحات ادمین: تأییدها، ساخت برنامه (هفته هدف با معادل شمسی)، اعضا، تنظیمات (روزهای جاروبرقی + فعال/غیرفعال)، آمار.
- همه متن‌ها فارسی، ارقام فارسی، تاریخ‌ها شمسی (`lib/jalali.ts` بدون وابستگی)، تم روشن/تاریک با توکن‌های VibeFarsi، Toast + Badge، ناوبری موبایل پایینی.
- PWA: `vite-plugin-pwa` با `autoUpdate`، مانیفست فارسی، آیکون ۱۹۲/۵۱۲ + اپل، کش NetworkFirst برای `/api/`.

## اجرای محلی

### بک‌اند (Django)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py seed_room --demo   # ادمین + ۸ هم‌اتاقی؛ رمز همه: room1234
.\.venv\Scripts\python manage.py runserver          # http://127.0.0.1:8000
```

کاربر `ali` نقش ادمین دارد (به‌علاوه `admin` سوپریوزر جنگو). اعتبارسنجی:

```powershell
.\.venv\Scripts\python manage.py shell --command "from schedule import tests_rules"
.\.venv\Scripts\python manage.py shell --command "from schedule import tests_api"
```

### فرانت‌اند (Vite)

```powershell
cd frontend
npm install
npm run dev      # http://localhost:5173 (پروکسی /api به جنگو)
npm run build    # خروجی PWA در dist/
```

استقرار آنلاین فرانت: `VITE_API_URL=https://api.example.com npm run build`.

## استقرار آنلاین (ساده و کم‌حجم)

```powershell
$env:DJANGO_SECRET_KEY="کلید-طولانی-تصادفی"
$env:DJANGO_DEBUG="0"
$env:DJANGO_ALLOWED_HOSTS="api.example.com"
$env:FRONTEND_URLS="https://room.example.com"
pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py seed_room
python backend/manage.py collectstatic --noinput
gunicorn config.wsgi --chdir backend --bind 0.0.0.0:8000
```

فرانت‌اند: پوشه `dist/` را روی هاست استاتیک (با fallback به `index.html`) بگذارید و `VITE_API_URL` را به دامنه بک‌اند بدهید.

## گیت (تاریخچه تمیز)

هر قابلیت بزرگ یک کامیت معنادار دارد: اسکافولد بک‌اند، احراز هویت، زمان‌بندی، جایگزینی، دنگ، سید و تست‌ها، فرانت‌اند (پایه، داشبورد/برنامه، هزینه/جایگزینی، ادمین)، PWA و اصلاحات نهایی.

