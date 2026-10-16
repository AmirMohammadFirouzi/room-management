import { cn, fa } from "@/lib/utils";

/** Frontend fallback palette mirroring User.AVATAR_COLORS (name-hash → color). */
export const AVATAR_FALLBACK_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0891B2",
  "#4F46E5",
  "#9333EA",
];

export function avatarFallbackColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_FALLBACK_COLORS[h % AVATAR_FALLBACK_COLORS.length];
}

export interface AvatarProps {
  name: string;
  src?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-base" };

/**
 * آواتار. Uploaded image when src is set; otherwise the first letter on a
 * per-user tile colour (default palette from the backend, changeable later).
 */
export function Avatar({ name, src, color, size = "md", className }: AvatarProps) {
  const initial = name.trim().charAt(0) || "؟";
  const bg = color || avatarFallbackColor(name || "؟");
  return (
    <span
      title={name}
      style={!src ? { backgroundColor: bg } : undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        sizes[size],
        className,
      )}
    >
      {src ? <img src={src} alt={name} className="size-full rounded-full object-cover" /> : initial}
    </span>
  );
}

/** Overlapping avatars with a «+n» tail. */
export function AvatarGroup({ people, max = 4, size = "md", className }: { people: { name: string; src?: string; color?: string }[]; max?: number; size?: AvatarProps["size"]; className?: string }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar key={p.name} {...p} size={size} className={cn("ring-2 ring-background", i > 0 && "-ms-2")} />
      ))}
      {rest > 0 && <span className="ms-2 text-xs text-muted-foreground">+{fa(rest)} نفر دیگر</span>}
    </div>
  );
}
