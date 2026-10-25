"use client"

import { ArrowLeft, Printer, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { ErrorState, LoadingState } from "@/components/common"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { config } from "@/lib/config"
import { discountPercentLabel, formatDateTime, formatMoney } from "@/lib/format"
import { useInvoice } from "@/lib/queries"
import { invoiceHref } from "@/lib/routes"

export function ReceiptView() {
  const params = useSearchParams()
  const id = params.get("id")
  const autoPrint = params.get("print") === "1"
  const invoice = useInvoice(Number(id))
  const printed = useRef(false)

  useEffect(() => {
    if (autoPrint && invoice.data && !printed.current) {
      printed.current = true
      // Let the receipt paint before opening the print dialog.
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [autoPrint, invoice.data])

  if (invoice.isLoading) return <LoadingState rows={6} className="mx-auto mt-10 max-w-sm" />
  if (invoice.isError) return <div className="mx-auto mt-10 max-w-md"><ErrorState error={invoice.error} onRetry={() => invoice.refetch()} /></div>
  const data = invoice.data!

  // One receipt line per medicine and unit (batch splits merged): boxes and loose pieces print separately.
  const lines = Object.values(
    data.items.reduce<Record<string, { name: string; pieces: number; packSize: number; total: number }>>((acc, item) => {
      const isBox = item.sale_unit === "pack"
      const line = (acc[`${item.product}:${item.sale_unit}`] ??= {
        name: isBox ? `${item.product_name} (box of ${item.pack_size})` : item.product_name,
        pieces: 0,
        packSize: isBox ? item.pack_size : 1,
        total: 0,
      })
      line.pieces += item.quantity
      line.total += Number(item.line_total)
      return acc
    }, {}),
  ).map((line) => {
    const qty = line.pieces / line.packSize // boxes for box lines, pieces otherwise
    return { name: line.name, qty, price: line.total / qty, total: line.total }
  })

  return (
    <div className="min-h-screen bg-muted/60 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-sm flex-wrap justify-center gap-2 px-4">
        <Button asChild variant="outline">
          <Link href={invoiceHref(data.id)}>
            <ArrowLeft /> Invoice
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        <Button asChild variant="outline">
          <Link href="/pos">
            <ShoppingCart /> New sale
          </Link>
        </Button>
      </div>

      <div className="receipt mx-auto w-[80mm] rounded-sm bg-white px-[4mm] py-[5mm] font-mono text-[11px] leading-snug text-black shadow-md">
        <div className="text-center">
          <LogoMark variant="mono" className="mx-auto mb-1.5 size-11 text-black" />
          <p className="text-[14px] font-bold uppercase">{config.pharmacy.name}</p>
          {config.pharmacy.address && <p>{config.pharmacy.address}</p>}
          {config.pharmacy.phone && <p>Tel: {config.pharmacy.phone}</p>}
        </div>

        <Divider />
        <Row left="Invoice" right={data.number} />
        <Row left="Date" right={formatDateTime(data.date)} />
        <Row left="Cashier" right={data.created_by_name} />
        {data.customer_name && <Row left="Customer" right={data.customer_name} />}
        <Divider />

        <div className="flex justify-between font-bold">
          <span>Item</span>
          <span>Amount</span>
        </div>
        {lines.map((line, i) => (
          <div key={i} className="mt-1">
            <p className="break-words">{line.name}</p>
            <Row left={`  ${line.qty} x ${formatMoney(line.price)}`} right={formatMoney(line.total)} />
          </div>
        ))}

        <Divider />
        <Row left="Subtotal" right={formatMoney(data.subtotal)} />
        {Number(data.discount) > 0 && <Row left={`Discount (${discountPercentLabel(data.discount, data.subtotal)})`} right={`-${formatMoney(data.discount)}`} />}
        <div className="my-1 flex justify-between text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(data.total)}</span>
        </div>
        <Row left={`Paid (${data.payment_method === "cash" ? "Cash" : "Card"})`} right={formatMoney(data.amount_received)} />
        {data.payment_method === "cash" && <Row left="Change" right={formatMoney(data.change_due)} />}
        {data.status !== "paid" && (
          <p className="mt-1 text-center font-bold uppercase">** {data.status.replace("_", " ")} **</p>
        )}

        <Divider />
        <p className="text-center">{config.pharmacy.footer}</p>
        <p className="mt-2 text-center">*** {data.number} ***</p>
      </div>
    </div>
  )
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="whitespace-pre">{left}</span>
      <span className="text-right">{right}</span>
    </div>
  )
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />
}
