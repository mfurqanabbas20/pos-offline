"use client"

import { AlertTriangle, CalendarX2, ChevronLeft, ChevronRight, Download, PackageMinus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ErrorState, ExpiryBadge, LoadingState, PageHeader, Spinner } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { saveBlob } from "@/lib/download"
import { currentMonth, formatDate, formatMoney, formatMonth, shiftMonth } from "@/lib/format"
import { useDashboard, useInventoryReport } from "@/lib/queries"
import { cn } from "@/lib/utils"

import { SalesChart } from "./sales-chart"

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth)
  const dashboard = useDashboard(month)
  const inventory = useInventoryReport()
  const data = dashboard.data
  const isCurrentMonth = month >= currentMonth()
  const [downloading, setDownloading] = useState(false)

  const downloadReport = async () => {
    setDownloading(true)
    try {
      saveBlob(await api.reports.monthly(month), `pharmacy-report-${month}.xlsx`)
      toast.success(`Report for ${formatMonth(month)} downloaded`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <PageHeader
        title="Dashboard"
        description={`Performance for ${formatMonth(month)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Input
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="w-44"
              aria-label="Month"
            />
            <Button
              variant="outline"
              size="icon"
              disabled={isCurrentMonth}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight />
            </Button>
            <Button onClick={downloadReport} disabled={downloading} title={`Excel report for ${formatMonth(month)}`}>
              {downloading ? <Spinner /> : <Download />} Download report
            </Button>
          </div>
        }
      />

      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : (
        <div className={cn("space-y-6 transition-opacity", dashboard.isFetching && dashboard.isPlaceholderData && "opacity-60")}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
            <StatCard label="Total sales" value={data && formatMoney(data.total_sales)} />
            <StatCard label="Returns" value={data && formatMoney(data.total_returns)} />
            <StatCard label="Net revenue" value={data && formatMoney(data.net_revenue)} highlight />
            <StatCard label="Profit" value={data && formatMoney(data.total_profit)} />
            <StatCard label="Invoices" value={data && String(data.invoice_count)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Daily sales vs profit</CardTitle>
                <CardDescription>Net of returns booked on each day</CardDescription>
              </CardHeader>
              <CardContent>{data ? <SalesChart data={data.daily} /> : <Skeleton className="h-[300px] w-full" />}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top products</CardTitle>
                <CardDescription>By revenue this month</CardDescription>
              </CardHeader>
              <CardContent>
                {!data ? (
                  <LoadingState rows={5} />
                ) : data.top_products.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No sales this month.</p>
                ) : (
                  <ol className="space-y-3">
                    {data.top_products.map((p, i) => (
                      <li key={p.product_id} className="flex items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.quantity} sold</p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{formatMoney(p.revenue)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <AlertCard
              icon={PackageMinus}
              tone="orange"
              label="Low stock"
              count={data?.low_stock_count}
              hint="Products at or below reorder level"
            />
            <AlertCard
              icon={AlertTriangle}
              tone="amber"
              label="Expiring soon"
              count={data?.expiring_count}
              hint={`Batches expiring within ${data?.expiry_warning_days ?? 90} days`}
            />
            <AlertCard icon={CalendarX2} tone="red" label="Expired" count={data?.expired_count} hint="Expired batches still on the shelf" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Low-stock products</CardTitle>
              </CardHeader>
              <CardContent>
                {inventory.isLoading ? (
                  <LoadingState rows={4} />
                ) : (
                  <AlertList
                    empty="All products are above their reorder level."
                    items={(inventory.data?.low_stock ?? []).slice(0, 6).map((p) => ({
                      key: p.id,
                      title: p.name,
                      subtitle: `Reorder at ${p.reorder_level}`,
                      right: <span className="font-semibold text-orange-700 tabular-nums">{p.sellable_stock} left</span>,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Expiry alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {inventory.isLoading ? (
                  <LoadingState rows={4} />
                ) : (
                  <AlertList
                    empty="No batches expired or expiring soon."
                    items={[...(inventory.data?.expired ?? []), ...(inventory.data?.expiring ?? [])].slice(0, 6).map((b) => ({
                      key: b.id,
                      title: b.product_name,
                      subtitle: `Batch ${b.batch_no} · ${b.quantity} units · ${formatDate(b.expiry_date)}`,
                      right: <ExpiryBadge status={b.expiry_status} days={b.days_to_expiry} />,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <Card className={cn(highlight && "border-primary/30 bg-accent/50")}>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-2 h-8 w-28" />
        ) : (
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", highlight && "text-accent-foreground")}>{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

const TONES = {
  orange: "bg-orange-50 text-orange-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
}

function AlertCard({
  icon: Icon,
  tone,
  label,
  count,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof TONES
  label: string
  count?: number
  hint: string
}) {
  return (
    <Link href="/inventory" className="block rounded-xl transition-shadow hover:shadow-sm">
      <Card>
        <CardContent className="flex items-center gap-4">
          <span className={cn("flex size-11 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{count ?? "–"}</p>
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function AlertList({
  items,
  empty,
}: {
  items: { key: number; title: string; subtitle: string; right: React.ReactNode }[]
  empty: string
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
          </div>
          <div className="shrink-0 text-sm">{item.right}</div>
        </li>
      ))}
    </ul>
  )
}
