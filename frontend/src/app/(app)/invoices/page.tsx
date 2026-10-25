"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { EmptyState, ErrorState, InvoiceStatusBadge, LoadingState, PageHeader } from "@/components/common"
import { LoadMore } from "@/components/infinite-scroll"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useInfiniteInvoices } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { invoiceHref } from "@/lib/routes"

const ALL = "all"

export default function InvoicesPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [status, setStatus] = useState(ALL)
  const debounced = useDebounce(search.trim())

  const invoices = useInfiniteInvoices({
    search: debounced,
    date_from: dateFrom,
    date_to: dateTo,
    status: status === ALL ? undefined : status,
  })
  const hasFilters = search || dateFrom || dateTo || status !== ALL

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <PageHeader
        title="Sales History"
        description="Every sale you have made, newest first."
        help="To reprint a receipt or return items, find the sale below and click it. You can search by receipt number or customer name, or pick dates."
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Receipt number (e.g. INV-000123) or customer name…"
                className="pl-9"
              />
            </div>
            <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
              From date
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
              To date
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sales</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially_returned">Some items returned</SelectItem>
                <SelectItem value="returned">Fully returned</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("")
                  setDateFrom("")
                  setDateTo("")
                  setStatus(ALL)
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {invoices.isError ? (
            <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
          ) : invoices.isLoading ? (
            <LoadingState rows={8} />
          ) : invoices.items.length === 0 ? (
            <EmptyState title={hasFilters ? "No sales match your search" : "No sales yet"} description={hasFilters ? "Try a different name or number, or clear the dates." : "Sales will appear here after you complete one on the New Sale screen."} />
          ) : (
            <div className={cn(invoices.isPlaceholderData && "opacity-60")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt no.</TableHead>
                    <TableHead>Date &amp; time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Paid by</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.items.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="h-14 cursor-pointer"
                      onClick={() => router.push(invoiceHref(invoice.id))}
                      onKeyDown={(e) => e.key === "Enter" && router.push(invoiceHref(invoice.id))}
                      tabIndex={0}
                    >
                      <TableCell className="font-medium text-primary">{invoice.number}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(invoice.date)}</TableCell>
                      <TableCell>{invoice.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{invoice.item_count}</TableCell>
                      <TableCell className="capitalize">{invoice.payment_method}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(invoice.total)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <LoadMore
              shown={invoices.items.length}
              total={invoices.count}
              hasNextPage={invoices.hasNextPage}
              isFetchingNextPage={invoices.isFetchingNextPage}
              fetchNextPage={invoices.fetchNextPage}
              noun="sales"
            />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
