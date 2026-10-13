import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A pseudo-3D icon: the lucide glyph floats above a tilted, layered tile with
 * a soft cast shadow — depth without any extra dependency.
 */
export function Icon3D({
  icon: Glyph,
  tone = 'bg-brand text-brand-foreground',
  size = 'md',
  className,
}: {
  icon: LucideIcon
  tone?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const dims =
    size === 'sm'
      ? 'size-9 [&_svg]:size-4'
      : size === 'lg'
        ? 'size-14 [&_svg]:size-7'
        : 'size-11 [&_svg]:size-5'

  function onMove(e: React.PointerEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: -py * 22, y: px * 22 })
  }

  return (
    <span style={{ perspective: '400px' }} className={cn('inline-block shrink-0', className)}>
      <span
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className={cn(
          'relative inline-flex items-center justify-center rounded-2xl shadow-overlay transition-transform duration-150',
          'before:absolute before:inset-0 before:rounded-2xl before:bg-black/25 before:blur-[6px] before:translate-y-1 before:-z-10',
          tone,
          dims,
        )}
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
          backgroundImage:
            'linear-gradient(145deg, rgba(255,255,255,.28), rgba(255,255,255,0) 55%)',
        }}
      >
        <span style={{ transform: 'translateZ(14px)', display: 'contents' }}>
          <Glyph className="drop-shadow-[0_2px_2px_rgba(0,0,0,.35)]" />
        </span>
      </span>
    </span>
  )
}
