import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BankCardProps {
  /** Brand name (e.g. «بانک نامن». */
  bankName: string
  /** Bank logo: a few letters or a short label. */
  logoLabel: string
  /** Primary brand color as a hex string, e.g. "#2563EB". */
  brandColor: string
  /** Account holder name. */
  holderName: string
  /** Masked card number (spaces optional). */
  cardNumber: string
  /** Optional subtitle under the card (e.g. "کارت پیش‌فرض"). */
  subtitle?: string
  className?: string
}

export function BankCard3D({
  bankName,
  logoLabel,
  brandColor,
  holderName,
  cardNumber,
  subtitle,
  className,
}: BankCardProps) {
  const [copied, setCopied] = React.useState(false)

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(cardNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard may be unavailable in some contexts */
    }
  }

  const digits = cardNumber.replace(/\s/g, "")
  const groups = digits.match(/.{1,4}/g)?.join(" ") ?? cardNumber

  return (
    <Card
      className={cn(
        "relative w-full max-w-md overflow-hidden border-0 shadow-surface",
        "after:absolute after:inset-0 after:-rotate-1 after:scale-105 after:bg-[radial-gradient(circle_at_30%_20%,var(--color-brand),transparent_55%),radial-gradient(circle_at_80%_80%,var(--color-brand),transparent_45%)] after:-z-10",
        className,
      )}
    >
      <CardContent className="relative flex flex-col items-center justify-center gap-2 px-4 py-6">
        <div className="flex items-center gap-2 rounded-control bg-card px-3 py-2 text-sm font-bold text-foreground">
          <span
            className="inline-flex size-8 items-center justify-center rounded-control text-base font-black"
            style={{ background: brandColor, color: "#fff" }}
          >
            {logoLabel}
          </span>
          <span className="max-w-[6rem] truncate text-balance">{bankName}</span>
        </div>

        <div className="my-4 flex items-center justify-center gap-2">
          <span className="text-4xl font-extrabold tracking-[0.2em] text-foreground">
            {groups}
          </span>
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>شروع کارت: </span>
          <span className="font-mono font-bold text-foreground">{digits.slice(0, 4)}</span>
          <span className="text-[10px] uppercase tracking-widest">•••• {digits.slice(-4)}</span>
        </div>

        <p className="text-sm font-semibold">{holderName}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

        <Button
          size="sm"
          variant="ghost"
          onClick={copyNumber}
          className="gap-1.5 text-xs"
          disabled={copied}
        >
          {copied ? "کپی شد" : "کپی شماره کارت"}
        </Button>
      </CardContent>
    </Card>
  )
}
