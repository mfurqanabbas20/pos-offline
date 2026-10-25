"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Minus, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { type FieldError, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { EmptyState, ErrorState, InvoiceStatusBadge, LoadingState, PageHeader, Spinner } from "@/components/common"
import { LoadMore } from "@/components/infinite-scroll"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/format"
import { useCreateReturn, useInfiniteInvoices, useInvoice } from "@/lib/queries"
import type { InvoiceDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { invoiceHref } from "@/lib/routes"

const REASONS = ["Wrong item dispensed", "Customer changed mind", "Damaged packaging", "Doctor changed prescription"]

export function NewReturnFlow() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initial = Number(searchParams.get("invoice")) || null
  const [invoiceId, setInvoiceId] = useState<number | null>(initial)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Button asChild variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <Link href="/returns">
          <ArrowLeft /> Returns
        </Link>
      </Button>
      <PageHeader title="Return items" description="Three steps: find the receipt, choose what is coming back, then give the refund." />
      {invoiceId ? (
        <ReturnForm
          invoiceId={invoiceId}
          onChangeInvoice={() => {
            setInvoiceId(null)
            router.replace("/returns/new")
          }}
        />
      ) : (
        <FindInvoice onSelect={setInvoiceId} />
      )}
    </div>
  )
}

function FindInvoice({ onSelect }: { onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("")
  const debounced = useDebounce(search.trim())
  const invoices = useInfiniteInvoices({ search: debounced }, { pageSize: 15 })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Step 1: Find the customer’s receipt</CardTitle>
        <CardDescription>Type the number printed on their receipt (e.g. INV-000123), or the customer’s name. Then click the right sale.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Receipt number or customer name…" className="h-12 pl-12 text-base" />
        </div>
        {invoices.isError ? (
          <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
        ) : invoices.isLoading ? (
          <LoadingState rows={4} />
        ) : invoices.items.length === 0 ? (
          <EmptyState title="No sale found" description="Check the receipt number or the customer’s name and try again." />
        ) : (
          <ul className="divide-y rounded-xl border">
            {invoices.items.map((invoice) => {
              const disabled = invoice.status === "returned"
              return (
                <li key={invoice.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(invoice.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <div>
                      <p className="font-medium">{invoice.number}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(invoice.date)} · {invoice.customer_name || "Walk-in"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <InvoiceStatusBadge status={invoice.status} />
                      <span className="font-medium tabular-nums">{formatMoney(invoice.total)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {invoices.items.length > 0 && (
          <LoadMore
            shown={invoices.items.length}
            total={invoices.count}
            hasNextPage={invoices.hasNextPage}
            isFetchingNextPage={invoices.isFetchingNextPage}
            fetchNextPage={invoices.fetchNextPage}
            noun="sales"
          />
        )}
      </CardContent>
    </Card>
  )
}

const schema = z
  .object({
    reason: z.string().trim().min(3, "Give a short reason for the return"),
    quantities: z.record(z.string(), z.number().int().min(0)),
  })
  .refine((v) => Object.values(v.quantities).some((q) => q > 0), {
    path: ["quantities"],
    message: "Select at least one item to return",
  })
type Values = z.infer<typeof schema>

function ReturnForm({ invoiceId, onChangeInvoice }: { invoiceId: number; onChangeInvoice: () => void }) {
  const router = useRouter()
  const invoice = useInvoice(invoiceId)
  const createReturn = useCreateReturn()
  const [confirming, setConfirming] = useState(false)

  const { register, handleSubmit, setValue, reset, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", quantities: {} },
  })
  const quantities = useWatch({ control, name: "quantities" })
  const reason = useWatch({ control, name: "reason" })
  // The refine() error sits on the record itself, not on one of its keys.
  const quantitiesError = (formState.errors.quantities as FieldError | undefined)?.message

  useEffect(() => {
    if (invoice.data) {
      reset({ reason: "", quantities: Object.fromEntries(invoice.data.items.map((i) => [String(i.id), 0])) })
    }
  }, [invoice.data, reset])

  if (invoice.isLoading) return <LoadingState rows={5} />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  const data = invoice.data as InvoiceDetail

  // Refunds are pro-rated by the invoice discount, mirroring the backend calculation.
  const paidRatio = toNumber(data.subtotal) ? toNumber(data.total) / toNumber(data.subtotal) : 1
  const refundEstimate = data.items.reduce((sum, item) => sum + (quantities[String(item.id)] ?? 0) * toNumber(item.unit_price) * paidRatio, 0)
  const totalUnits = Object.values(quantities).reduce((a, b) => a + b, 0)

  const setQty = (itemId: number, qty: number, max: number) =>
    setValue(`quantities.${itemId}`, Math.min(Math.max(0, qty || 0), max), { shouldValidate: formState.isSubmitted })

  const submit = (values: Values) =>
    createReturn.mutate(
      {
        invoice: data.id,
        reason: values.reason.trim(),
        items: Object.entries(values.quantities)
          .filter(([, q]) => q > 0)
          .map(([id, quantity]) => ({ invoice_item: Number(id), quantity })),
      },
      {
        onSuccess: (ret) => {
          toast.success(`Return ${ret.number} recorded`, { description: `Refund ${formatMoney(ret.refund_amount)}` })
          router.push(invoiceHref(data.id))
        },
        onError: (error) => {
          setConfirming(false)
          toast.error(error.message)
        },
      },
    )

  return (
    <form onSubmit={handleSubmit(() => setConfirming(true))} className="space-y-6" noValidate>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-3">
              {data.number} <InvoiceStatusBadge status={data.status} />
            </CardTitle>
            <CardDescription>
              {formatDateTime(data.date)} · {data.customer_name || "Walk-in"} · paid {formatMoney(data.total)} by {data.payment_method}
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onChangeInvoice}>
            Pick a different receipt
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-lg font-medium">Step 2: How many of each item is coming back?</p>
          {data.items.map((item) => {
            const qty = quantities[String(item.id)] ?? 0
            const max = item.returnable_quantity
            return (
              <div
                key={item.id}
                className={cn("flex flex-wrap items-center gap-4 rounded-xl border p-3", qty > 0 && "border-primary bg-accent/40", max === 0 && "opacity-50")}
              >
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Batch {item.batch_no} · exp {formatDate(item.expiry_date)} · {formatMoney(item.unit_price)} a piece
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sold {item.quantity} {item.quantity === 1 ? "piece" : "pieces"}
                    {item.sale_unit === "pack" && ` (as boxes of ${item.pack_size})`}
                    {item.returned_quantity > 0 && ` · already returned ${item.returned_quantity}`} · <strong>{max} returnable</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" disabled={qty <= 0} onClick={() => setQty(item.id, qty - 1, max)} aria-label="Decrease">
                    <Minus />
                  </Button>
                  <Input
                    inputMode="numeric"
                    value={qty}
                    disabled={max === 0}
                    onChange={(e) => setQty(item.id, parseInt(e.target.value, 10), max)}
                    className="w-16 text-center tabular-nums"
                    aria-label={`Return quantity for ${item.product_name}`}
                  />
                  <Button type="button" variant="outline" size="icon" disabled={qty >= max} onClick={() => setQty(item.id, qty + 1, max)} aria-label="Increase">
                    <Plus />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={max === 0 || qty === max} onClick={() => setQty(item.id, max, max)}>
                    All
                  </Button>
                </div>
              </div>
            )
          })}
          {quantitiesError && <p className="text-sm text-destructive">{quantitiesError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <Label htmlFor="reason" className="text-lg">Step 3: Why is it being returned?</Label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Button
                key={r}
                type="button"
                variant={reason === r ? "default" : "outline"}
                onClick={() => setValue("reason", r, { shouldValidate: formState.isSubmitted })}
              >
                {r}
              </Button>
            ))}
          </div>
          <Textarea id="reason" rows={2} placeholder="Or type the reason in your own words…" aria-invalid={!!formState.errors.reason} {...register("reason")} />
          {formState.errors.reason && <p className="text-sm text-destructive">{formState.errors.reason.message}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div>
          <p className="text-muted-foreground">Give back to the customer</p>
          <p className="text-2xl font-semibold tabular-nums">{formatMoney(refundEstimate)}</p>
          {paidRatio < 1 && <p className="text-xs text-muted-foreground">Adjusted for the invoice discount</p>}
        </div>
        <Button type="submit" size="lg" className="min-w-48">
          Continue
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Is this correct?</AlertDialogTitle>
            <AlertDialogDescription>
              {totalUnits} unit(s) from {data.number} will be restocked to their original batches and{" "}
              <strong>{formatMoney(refundEstimate)}</strong> refunded. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createReturn.isPending}>No, go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={createReturn.isPending}
              onClick={(e) => {
                e.preventDefault()
                handleSubmit(submit)()
              }}
            >
              {createReturn.isPending && <Spinner />}
              Yes, complete the return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
