"use client"

import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { ExpiryStatus, InvoiceStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
      <AlertCircle className="size-6 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
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
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="min-w-16 text-center">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight />
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
    status === "expired" ? `Expired ${Math.abs(days)}d ago` : status === "expiring" ? `${days}d left` : "OK"
  return (
    <Badge variant="outline" className={EXPIRY_STYLES[status]}>
      {label}
    </Badge>
  )
}

export function LowStockBadge() {
  return (
    <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
      Low stock
    </Badge>
  )
}

const STATUS_STYLES: Record<InvoiceStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "border-primary/20 bg-accent text-accent-foreground" },
  partially_returned: { label: "Partially returned", className: "border-amber-200 bg-amber-50 text-amber-700" },
  returned: { label: "Returned", className: "border-slate-200 bg-slate-100 text-slate-600" },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  )
}
