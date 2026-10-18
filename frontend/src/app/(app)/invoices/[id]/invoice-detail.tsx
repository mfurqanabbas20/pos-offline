"use client"

import { ArrowLeft, Printer, Undo2 } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { ErrorState, InvoiceStatusBadge, LoadingState, PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDateTime, formatMoney } from "@/lib/format"
import { useInvoice } from "@/lib/queries"

export function InvoiceDetailView() {
  const { id } = useParams<{ id: string }>()
  const invoice = useInvoice(Number(id))

  if (invoice.isLoading) return <LoadingState rows={6} className="mx-auto max-w-5xl" />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  const data = invoice.data!
  const canReturn = data.status !== "returned"

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <Link href="/invoices">
          <ArrowLeft /> Invoices
        </Link>
      </Button>
      <PageHeader
        title={data.number}
        description={formatDateTime(data.date)}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/receipt/${data.id}?print=1`}>
                <Printer /> Print receipt
              </Link>
            </Button>
            {canReturn && (
              <Button asChild size="lg">
                <Link href={`/returns/new?invoice=${data.id}`}>
                  <Undo2 /> Return items
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="h-14">
                    <TableCell>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.product_sku}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">{item.batch_no}</p>
                      <p className="text-xs text-muted-foreground">Exp {formatDate(item.expiry_date)}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity}
                      {item.returned_quantity > 0 && (
                        <span className="block text-xs text-amber-700">{item.returned_quantity} returned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(item.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Summary</CardTitle>
              <InvoiceStatusBadge status={data.status} />
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Line label="Customer" value={data.customer_name || "Walk-in"} />
                <Line label="Cashier" value={data.created_by_name} />
                <Line label="Payment" value={<span className="capitalize">{data.payment_method}</span>} />
                <div className="my-3 border-t" />
                <Line label="Subtotal" value={formatMoney(data.subtotal)} />
                {Number(data.discount) > 0 && <Line label="Discount" value={`− ${formatMoney(data.discount)}`} />}
                <Line label="Total" value={formatMoney(data.total)} strong />
                <Line label="Received" value={formatMoney(data.amount_received)} />
                <Line label="Change" value={formatMoney(data.change_due)} />
              </dl>
            </CardContent>
          </Card>

          {data.returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Returns</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {data.returns.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div>
                        <p className="font-medium">{r.number}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(r.date)} · {r.reason}
                        </p>
                      </div>
                      <span className="font-medium text-amber-700 tabular-nums">−{formatMoney(r.refund_amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between text-base font-semibold" : "flex justify-between"}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
