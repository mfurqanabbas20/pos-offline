"use client"

import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Lightbulb, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { ExpiryStatus, InvoiceStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  help,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Short "how this page works" guidance for first-time users. */
  help?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-base text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {help && <HelpTip>{help}</HelpTip>}
    </div>
  )
}

/** A calm teal tip box: tells a first-time user what to do on this screen. */
export function HelpTip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-primary/20 bg-accent/60 px-4 py-3 text-[0.95rem] text-accent-foreground", className)}>
      <Lightbulb className="mt-0.5 size-5 shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

export function LoadingState({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong."
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="text-lg font-medium text-destructive">Sorry, this could not be loaded</p>
      <p className="text-destructive">{message}</p>
      <p className="text-sm text-muted-foreground">Check the internet or server connection, then press Try again.</p>
      {onRetry && (
        <Button size="lg" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <span className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-7 text-muted-foreground" />
      </span>
      <p className="text-lg font-medium">{title}</p>
      {description && <p className="max-w-md text-muted-foreground">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  count,
  onPageChange,
}: {
  page: number
  pageSize: number
  count: number
  onPageChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (count === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, count)
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 text-muted-foreground">
      <span>
        Showing {from}–{to} of {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <span className="min-w-24 text-center">
          Page {page} of {pages}
        </span>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

const EXPIRY_STYLES: Record<ExpiryStatus, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiring: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
}

export function ExpiryBadge({ status, days }: { status: ExpiryStatus; days: number }) {
  const label =
    status === "expired"
      ? `Expired ${plural(Math.abs(days), "day")} ago`
      : status === "expiring"
        ? days === 0
          ? "Expires today"
          : `Expires in ${plural(days, "day")}`
        : "Good"
  return (
    <Badge variant="outline" className={EXPIRY_STYLES[status]}>
      {label}
    </Badge>
  )
}

export function LowStockBadge() {
  return (
    <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
      Running low
    </Badge>
  )
}

const STATUS_STYLES: Record<InvoiceStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "border-primary/20 bg-accent text-accent-foreground" },
  partially_returned: { label: "Some items returned", className: "border-amber-200 bg-amber-50 text-amber-700" },
  returned: { label: "Fully returned", className: "border-slate-200 bg-slate-100 text-slate-600" },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  )
}

/** "1 day", "3 days" */
export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}
