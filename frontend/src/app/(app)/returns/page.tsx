"use client"

import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useReturns } from "@/lib/queries"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20

export default function ReturnsPage() {
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim())
  const returns = useReturns({ search: debounced, date_from: dateFrom, date_to: dateTo, page, page_size: PAGE_SIZE })

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <PageHeader
        title="Returns & Refunds"
        description="Items customers brought back, and the money refunded."
        help="When a customer brings something back, press “Start a return”, find their receipt, choose the items, and give the refund shown. The items go back into stock automatically."
        actions={
          <Button asChild size="lg">
            <Link href="/returns/new">
              <Plus /> Start a return
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Receipt number, customer name or reason…"
                className="pl-9"
              />
            </div>
            <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
              From date
              <Input type="date" value={dateFrom} onChange={(e) => (setDateFrom(e.target.value), setPage(1))} />
            </label>
            <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
              To date
              <Input type="date" value={dateTo} onChange={(e) => (setDateTo(e.target.value), setPage(1))} />
            </label>
          </div>

          {returns.isError ? (
            <ErrorState error={returns.error} onRetry={() => returns.refetch()} />
          ) : returns.isLoading ? (
            <LoadingState rows={8} />
          ) : returns.data?.results.length === 0 ? (
            <EmptyState
              title="No returns yet"
              action={
                <Button asChild variant="outline">
                  <Link href="/returns/new">Start a return</Link>
                </Button>
              }
            />
          ) : (
            <div className={cn(returns.isPlaceholderData && "opacity-60")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return no.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>From receipt</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Done by</TableHead>
                    <TableHead className="text-right">Money refunded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.data?.results.map((r) => (
                    <TableRow key={r.id} className="h-14">
                      <TableCell className="font-medium">{r.number}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(r.date)}</TableCell>
                      <TableCell>
                        <Link href={`/invoices/${r.invoice}`} className="font-medium text-primary hover:underline">
                          {r.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64">
                        {r.items.map((item) => (
                          <p key={item.id} className="truncate text-sm">
                            {item.quantity} × {item.product_name}
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground" title={r.reason}>{r.reason}</TableCell>
                      <TableCell className="hidden text-muted-foreground 2xl:table-cell">{r.created_by_name}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.refund_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} count={returns.data?.count ?? 0} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
