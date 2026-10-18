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
        title="Returns"
        description="Returned items go back into their original batch."
        actions={
          <Button asChild size="lg">
            <Link href="/returns/new">
              <Plus /> New return
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Return #, invoice #, reason or customer…"
                className="pl-9"
              />
            </div>
            <Input type="date" value={dateFrom} onChange={(e) => (setDateFrom(e.target.value), setPage(1))} className="w-full sm:w-40" aria-label="From date" />
            <Input type="date" value={dateTo} onChange={(e) => (setDateTo(e.target.value), setPage(1))} className="w-full sm:w-40" aria-label="To date" />
          </div>

          {returns.isError ? (
            <ErrorState error={returns.error} onRetry={() => returns.refetch()} />
          ) : returns.isLoading ? (
            <LoadingState rows={8} />
          ) : returns.data?.results.length === 0 ? (
            <EmptyState
              title="No returns found"
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
                    <TableHead>Return</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="hidden 2xl:table-cell">By</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
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
