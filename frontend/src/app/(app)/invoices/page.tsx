"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { EmptyState, ErrorState, InvoiceStatusBadge, LoadingState, PageHeader, Pagination } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useInvoices } from "@/lib/queries"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20
const ALL = "all"

export default function InvoicesPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim())

  const invoices = useInvoices({
    search: debounced,
    date_from: dateFrom,
    date_to: dateTo,
    status: status === ALL ? undefined : status,
    page,
    page_size: PAGE_SIZE,
  })
  const withReset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }
  const hasFilters = search || dateFrom || dateTo || status !== ALL

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Invoices" description="Every completed sale, newest first." />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => withReset(setSearch)(e.target.value)}
                placeholder="Invoice # or customer…"
                className="pl-9"
              />
            </div>
            <Input type="date" value={dateFrom} onChange={(e) => withReset(setDateFrom)(e.target.value)} className="w-full sm:w-40" aria-label="From date" />
            <Input type="date" value={dateTo} onChange={(e) => withReset(setDateTo)(e.target.value)} className="w-full sm:w-40" aria-label="To date" />
            <Select value={status} onValueChange={withReset(setStatus)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially_returned">Partially returned</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
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
                  setPage(1)
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
          ) : invoices.data?.results.length === 0 ? (
            <EmptyState title="No invoices found" description={hasFilters ? "Try widening your filters." : "Completed sales will appear here."} />
          ) : (
            <div className={cn(invoices.isPlaceholderData && "opacity-60")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.data?.results.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="h-14 cursor-pointer"
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && router.push(`/invoices/${invoice.id}`)}
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
              <Pagination page={page} pageSize={PAGE_SIZE} count={invoices.data?.count ?? 0} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
