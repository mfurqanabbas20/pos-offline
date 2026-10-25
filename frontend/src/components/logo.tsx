import { useId } from "react"

import { config } from "@/lib/config"
import { cn } from "@/lib/utils"

/**
 * Tasneem Pharmacy mark: a "T" whose stem is a two-tone capsule, with a small medical cross.
 * `color` = teal tile for the app; `mono` = black outline glyph for thermal receipts.
 */
export function LogoMark({ className, variant = "color" }: { className?: string; variant?: "color" | "mono" }) {
  const id = useId().replace(/:/g, "")

  if (variant === "mono") {
    return (
      <svg viewBox="0 0 48 48" className={className} role="img" aria-label={config.pharmacy.name}>
        <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="11" y="11" width="26" height="7.5" rx="3.75" fill="currentColor" />
        <rect x="20.25" y="20" width="7.5" height="20" rx="3.75" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M20.25 30v-6.25a3.75 3.75 0 0 1 7.5 0v6.25z" fill="currentColor" />
        <path d="M37 30v8M33 34h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={config.pharmacy.name}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="0.55" stopColor="#0d9488" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <clipPath id={`${id}-stem`}>
          <rect x="20.25" y="20" width="7.5" height="20" rx="3.75" />
        </clipPath>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id}-bg)`} />
      {/* soft highlight */}
      <path d="M0 13A13 13 0 0 1 13 0h22a13 13 0 0 1 13 13v3C34 22 14 22 0 16z" fill="#fff" opacity="0.1" />
      {/* T crossbar */}
      <rect x="11" y="11" width="26" height="7.5" rx="3.75" fill="#fff" />
      {/* capsule stem: solid top half, translucent bottom half */}
      <g clipPath={`url(#${id}-stem)`}>
        <rect x="20.25" y="20" width="7.5" height="10" fill="#fff" />
        <rect x="20.25" y="30" width="7.5" height="10" fill="#ccfbf1" opacity="0.7" />
      </g>
      <rect x="20.25" y="20" width="7.5" height="20" rx="3.75" fill="none" stroke="#fff" strokeWidth="1.2" />
      {/* medical cross */}
      <path d="M36.5 30.5v7M33 34h7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/** Logo + two-line wordmark ("Tasneem" / "Pharmacy"). The wordmark hides when `compact`. */
export function Logo({ className, compact, size = "md" }: { className?: string; compact?: boolean; size?: "md" | "lg" }) {
  const [first, ...rest] = config.pharmacy.name.split(" ")
  const tagline = rest.join(" ")
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <LogoMark className={cn("shrink-0 drop-shadow-sm", size === "lg" ? "size-14" : "size-10")} />
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn("truncate font-semibold tracking-tight text-foreground", size === "lg" ? "text-2xl" : "text-[1.05rem]")}>
            {first}
          </span>
          {tagline && (
            <span
              className={cn(
                "mt-1 truncate font-medium tracking-[0.18em] text-primary uppercase",
                size === "lg" ? "text-xs" : "text-[0.62rem]",
              )}
            >
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
