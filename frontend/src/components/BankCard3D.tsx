import * as React from 'react'
import { Check, Copy, CreditCard } from 'lucide-react'
import { fa } from '@/lib/utils'
import { cn } from '@/lib/utils'

export interface BankCardProps {
  /** Brand name, e.g. «بانک ملت». */
  bankName: string
  /** Bank logo: a few letters or an emoji. */
  logoLabel: string
  /** Primary brand color as a hex string, e.g. «#1E40AF». */
  brandColor: string
  /** Account holder name. */
  holderName: string
  /** Card number (digits; spaces optional). */
  cardNumber: string
  /** Optional subtitle, e.g. «کارت مشترک اتاق». */
  subtitle?: string
  className?: string
}

/** Realistic 3D bank card: logo, brand color, holder and a copyable number. */
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
  const ref = React.useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const digits = cardNumber.replace(/\D/g, '').padStart(16, '•').slice(-16)
  const groups = digits.match(/.{1,4}/g)?.join(' ') ?? digits
  const color = /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#1E40AF'

  function onMove(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: -py * 14, y: px * 18 })
  }

  const copyNumber = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation()
    try {
      await navigator.clipboard.writeText(digits)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be unavailable in some contexts */
    }
  }

  return (
    <div style={{ perspective: '900px' }} className={cn('w-full', className)}>
      <div
        ref={ref}
        dir="ltr"
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="relative aspect-[8/5] w-full overflow-hidden rounded-2xl text-white shadow-overlay transition-transform duration-150"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
          background: `linear-gradient(135deg, ${color} 0%, #0b1226 130%)`,
        }}
      >
        {/* sheen + glowing orb */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 200px at 15% 0%, rgba(255,255,255,.25), transparent 60%), radial-gradient(300px 300px at 90% 100%, rgba(255,255,255,.12), transparent 60%)',
          }}
        />
        {/* chip */}
        <div
          className="absolute start-6 top-14 h-9 w-12 rounded-md"
          style={{
            background:
              'linear-gradient(135deg,#f6d47c 0%,#d9a441 40%,#8a5f1c 60%,#f1c96b 100%)',
            transform: 'translateZ(30px)',
          }}
        >
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-px p-1.5 opacity-60">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[2px] bg-black/40" />
            ))}
          </div>
        </div>

        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between p-5"
          style={{ transform: 'translateZ(42px)' }}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-sm font-black ring-1 ring-white/40 backdrop-blur">
              {logoLabel || <CreditCard className="size-4" />}
            </span>
            <span dir="rtl" className="text-sm font-bold drop-shadow">
              {bankName}
            </span>
          </div>
          {subtitle && (
            <span dir="rtl" className="text-[11px] text-white/70">
              {subtitle}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={copyNumber}
          aria-label="کپی شماره کارت"
          dir="ltr"
          className="absolute inset-x-0 top-[46%] flex cursor-pointer items-center justify-center gap-2 px-6"
          style={{ transform: 'translateZ(48px)' }}
        >
          <span className="font-mono text-[clamp(1.05rem,5.2vw,1.5rem)] font-bold tracking-[0.12em] drop-shadow-[0_2px_2px_rgba(0,0,0,.5)]">
            {fa(groups)}
          </span>
          {copied ? (
            <Check className="size-4 shrink-0 text-emerald-300" />
          ) : (
            <Copy className="size-4 shrink-0 text-white/70" />
          )}
        </button>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-[11px]">
          <div dir="rtl" className="flex flex-col gap-0.5">
            <span className="text-white/60">صاحب کارت</span>
            <span className="text-sm font-bold">{holderName || '—'}</span>
          </div>
          <div className="text-white/70">
            {copied ? (
              <span dir="rtl" className="font-bold text-emerald-300">
                کپی شد ✓
              </span>
            ) : (
              <span dir="rtl">برای کپی لمس کنید</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
