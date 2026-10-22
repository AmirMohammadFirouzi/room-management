import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  LayoutGrid,
  ArrowLeftRight,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth";
import { api } from "@/lib/api";
import { formatJalali } from "@/lib/jalali";
import { cn, fa, faNumber, formatToman } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useDashboard } from "@/hooks/useDashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/TaskCard";
import { NotificationsBox } from "@/components/Notifications";

/**
 * First-load skeleton that mirrors the real bento structure (greeting +
 * 3+2 grid + two action tiles) so the swap to real content causes no jump.
 */
function DashboardSkeleton() {
  return (
    <div className="flex min-h-[60dvh] flex-col gap-4" aria-busy="true">
      <div className="h-8 w-44 animate-pulse rounded-control bg-muted" />
      <div className="grid gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-2 md:col-span-3">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-36 animate-pulse rounded-surface bg-muted" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-16 animate-pulse rounded-surface bg-muted" />
          <div className="h-16 animate-pulse rounded-surface bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-surface bg-muted" />
        <div className="h-20 animate-pulse rounded-surface bg-muted" />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        در حال بارگذاری داشبورد…
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, error, loading, reload } = useDashboard();
  const [confirmingId, setConfirmingId] = React.useState<number | null>(null);
  const navigate = useNavigate();

  const today = data?.today ?? '';
  const myToday = (data?.my_week ?? []).filter((a) => a.date === today);
  const restOfWeek = (data?.my_week ?? []).filter((a) => a.date !== today);

  async function confirm(id: number) {
    setConfirmingId(id);
    try {
      await api.post(`/assignments/${id}/confirm/`);
      toast({ title: "آفرین! تکلیف تأیید شد", variant: "success" });
      reload();
    } catch (e) {
      toast({
        title: "خطا در تأیید",
        description: e instanceof Error ? e.message : "خطایی رخ داد.",
        variant: "error",
      });
    } finally {
      setConfirmingId(null);
    }
  }

  // No data yet: show a real error card (with retry) instead of an endless
  // skeleton; otherwise show the structure-matching skeleton.
  if (!data) {
    if (error && !loading) {
      return (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle
              className="size-6 text-destructive"
              strokeWidth={1.75}
            />
            <p className="text-sm font-semibold">
              خطا در دریافت اطلاعات داشبورد
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button size="sm" onClick={reload}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      );
    }
    return <DashboardSkeleton />;
  }

  const pendingTotal =
    data.pending.substitutions +
    data.pending.payments +
    data.pending.unconfirmed;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">
          سلام {user?.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">{today ? formatJalali(today) : '…'}</p>
      </div>

      {!data.schedule_exists && (
        <Card className="border-warning">
          <CardContent className="flex items-center gap-3 py-4">
            <LayoutGrid
              className="size-5 shrink-0 text-warning"
              strokeWidth={1.75}
            />
            <p className="flex-1 text-sm">
              برنامه‌ی این هفته هنوز ساخته نشده است. از مدیر بخواهید برنامه را
              بسازد.
            </p>
            {user?.is_admin && (
              <Button size="sm" onClick={() => navigate("/admin/schedule")}>
                ساخت برنامه
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <section className="grid min-w-0 items-stretch gap-3 md:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-3 md:col-span-3">
          <Card className="h-full min-w-0">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles
                  className="size-4 shrink-0 text-brand"
                  strokeWidth={1.75}
                />
                <CardTitle className="text-sm font-bold">
                  وظایف امروز من
                </CardTitle>
              </div>

              {myToday.length > 0 && (
                <Badge variant="brand">{fa(myToday.length)} مورد</Badge>
              )}
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              {myToday.length === 0 ? (
                <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm leading-6 text-muted-foreground">
                  امروز وظیفه‌ای نداری — استراحت!
                </p>
              ) : (
                myToday.map((a) => (
                  <TaskCard
                    key={a.id}
                    assignment={a}
                    showAssignee={false}
                    canConfirm
                    confirming={confirmingId === a.id}
                    onConfirm={confirm}
                    onSubstitute={() => navigate("/schedule")}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {restOfWeek.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className="px-1 text-sm font-bold text-muted-foreground">
                بقیه‌ی وظایف این هفته
              </h2>

              {restOfWeek.map((a) => (
                <TaskCard
                  key={a.id}
                  assignment={a}
                  showAssignee={false}
                  canConfirm
                  confirming={confirmingId === a.id}
                  onConfirm={confirm}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col md:col-span-2">
          <NotificationsBox compact />
        </div>
      </section>

      {myToday.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">
            امروز در اتاق
          </h2>
          {myToday.map((a) => (
            <TaskCard key={a.id} assignment={a} />
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        <Card
          className={cn(
            "flex h-full min-w-0 flex-col",
            data.balance.unpaid_total > 0 && "border-warning",
          )}
        >
          <CardHeader className="flex-row items-center gap-2 pb-1">
            <Wallet
              className="size-4 shrink-0 text-warning"
              strokeWidth={1.75}
            />
            <CardTitle className="text-xs font-medium text-muted-foreground">
              بدهی باقی‌مانده من
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col">
            {data.balance.unpaid_total > 0 ? (
              <>
                <p className="font-display text-xl font-bold text-warning">
                  {formatToman(data.balance.unpaid_total)}
                </p>
                <Link
                  to="/expenses"
                  className="mt-2 text-xs text-brand hover:underline"
                >
                  مشاهده‌ی هزینه‌ها
                </Link>
              </>
            ) : (
              <p className="flex flex-1 items-center justify-center py-1 text-center text-sm font-semibold text-success">
                حسابت صافه رفیق! بدهی نداری
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            "flex h-full min-w-0 flex-col",
            pendingTotal > 0 && "border-brand",
          )}
        >
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              موارد در انتظار
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-2">
            <p className="font-display text-lg font-bold">
              {fa(pendingTotal)} مورد
            </p>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {data.pending.unconfirmed > 0 && (
                <span>تأییدنشده: {fa(data.pending.unconfirmed)}</span>
              )}
              {data.pending.payments > 0 && (
                <span>پرداخت: {fa(data.pending.payments)}</span>
              )}
              {data.pending.substitutions > 0 && (
                <span>جایگزینی: {fa(data.pending.substitutions)}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          className="h-auto justify-start gap-2 p-4"
          onClick={() => navigate("/substitutions")}
        >
          <ArrowLeftRight
            className="size-5 shrink-0 text-brand"
            strokeWidth={1.75}
          />
          <span className="text-start">
            <span className="block text-sm font-semibold">
              درخواست جایگزینی
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {data.pending.substitutions > 0
                ? `${fa(data.pending.substitutions)} درخواست باز`
                : "کسی را جای خودت بگذار"}
            </span>
          </span>
        </Button>
        <Button
          variant="secondary"
          className="h-auto justify-start gap-2 p-4"
          onClick={() => navigate("/expenses")}
        >
          <Wallet className="size-5 shrink-0 text-brand" strokeWidth={1.75} />
          <span className="text-start">
            <span className="block text-sm font-semibold">هزینه‌ها و دنگ</span>
            <span className="block text-xs font-normal text-muted-foreground">
              پرداخت‌شده: {formatToman(data.balance.paid_total)}
            </span>
          </span>
        </Button>
      </section>

      {user?.is_admin &&
        (data.pending.pending_substitutions ?? 0) +
          (data.pending.pending_payments ?? 0) >
          0 && (
          <Card className="border-brand">
            <CardContent className="flex items-center gap-3 py-4">
              <p className="flex-1 text-sm">
                {faNumber(
                  (data.pending.pending_substitutions ?? 0) +
                    (data.pending.pending_payments ?? 0),
                )}{" "}
                مورد در صف تأیید مدیر است.
              </p>
              <Button size="sm" onClick={() => navigate("/admin/approvals")}>
                بررسی تأییدها
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
