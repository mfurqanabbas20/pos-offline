"use client"

import { ArrowLeft, Printer, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { ErrorState, LoadingState } from "@/components/common"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { config } from "@/lib/config"
import { discountPercentLabel, displayName, formatAmount, formatReceiptDate } from "@/lib/format"
import { useInvoice } from "@/lib/queries"
import { invoiceHref } from "@/lib/routes"

export function ReceiptView() {
  const params = useSearchParams()
  const id = params.get("id")
  const autoPrint = params.get("print") === "1"
  const invoice = useInvoice(Number(id))
  const printed = useRef(false)
  const [printedAt] = useState(() => new Date())

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
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0)
  const isCash = data.payment_method === "cash"
  const hasDiscount = Number(data.discount) > 0

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

      <div className="receipt mx-auto w-[80mm] rounded-sm bg-white px-[4mm] py-[5mm] font-sans text-[11px] leading-snug text-black shadow-md">
        {/* Shop header */}
        <div className="text-center">
          <LogoMark variant="mono" className="mx-auto mb-1 size-10 text-black" />
          <p className="text-[15px] font-bold uppercase tracking-wide">{config.pharmacy.name}</p>
          {config.pharmacy.address && <p>{config.pharmacy.address}</p>}
          {config.pharmacy.phone && <p>Ph: {config.pharmacy.phone}</p>}
          <p className="mx-auto mt-1.5 w-fit border border-black px-4 py-0.5 text-[12px] font-bold">Sale Receipt</p>
        </div>

        {/* Invoice details */}
        <div className="mt-2 text-[10px]">
          <p>
            Inv#: {data.number} | User: {displayName(data.created_by_name)} | Pay: {isCash ? "Cash" : "Card"}
          </p>
          <p>
            Date: {formatReceiptDate(data.date)} | Cust: {data.customer_name || "Walk In Customer"}
          </p>
        </div>

        {/* Items */}
        <div className="mt-1.5 border-y-2 border-black py-1 font-bold">
          <p>Item Name</p>
          <Cols cells={["MRP", "Price", "Qty", "Amount"]} />
        </div>
        {lines.map((line, i) => (
          <div key={i} className="border-b border-dotted border-black py-1">
            <p className="break-words font-bold">{line.name}</p>
            <Cols cells={[formatAmount(line.price), formatAmount(line.price), String(line.qty), formatAmount(line.total)]} />
          </div>
        ))}
        <div className="mt-1.5 flex justify-between font-bold">
          <span>Total Items: {lines.length}</span>
          <span>Total Qty: {totalQty}</span>
        </div>

        {/* Totals */}
        <div className="mt-1.5 border-2 border-black px-2 py-1">
          <Row label="Invoice Amount" value={formatAmount(data.subtotal)} bold />
          {hasDiscount && (
            <Row label={`Discount (${discountPercentLabel(data.discount, data.subtotal)})`} value={`-${formatAmount(data.discount)}`} />
          )}
          <Row label="Net Amount" value={formatAmount(data.total)} bold big />
        </div>

        {/* Payment */}
        <table className="mt-1.5 w-full border-collapse border-2 border-black">
          <tbody>
            <tr className="border-b border-black font-bold">
              <td className="border-r border-black px-2 py-0.5">Mode</td>
              <td className="px-2 py-0.5 text-right">Amount</td>
            </tr>
            <tr className="border-b border-black">
              <td className="border-r border-black px-2 py-0.5">{isCash ? "Cash" : "Card"}</td>
              <td className="px-2 py-0.5 text-right">{formatAmount(data.amount_received)}</td>
            </tr>
            {isCash && (
              <tr>
                <td className="border-r border-black px-2 py-0.5">Cash Return</td>
                <td className="px-2 py-0.5 text-right">{formatAmount(data.change_due)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {data.status !== "paid" && (
          <p className="mt-1.5 text-center font-bold uppercase">** {data.status.replace("_", " ")} **</p>
        )}

        {/* Terms and footer */}
        <div className="mt-3">
          <p className="font-bold">Terms And Conditions</p>
          <ol className="list-inside list-decimal">
            {config.pharmacy.terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </div>
        <div className="mt-3 text-center">
          <p className="text-[13px] font-bold italic">{config.pharmacy.footer}</p>
          <p className="mt-1">Printed: {formatReceiptDate(printedAt, true)}</p>
          <p>Software Developed by: {config.poweredBy}</p>
        </div>
      </div>
    </div>
  )
}

/** Item columns: MRP and Price on the left, Qty in the middle, Amount on the right (as on the shop's old receipts). */
function Cols({ cells }: { cells: [string, string, string, string] }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_0.6fr_1.2fr] gap-1">
      <span>{cells[0]}</span>
      <span className="text-right">{cells[1]}</span>
      <span className="text-right">{cells[2]}</span>
      <span className="text-right">{cells[3]}</span>
    </div>
  )
}

function Row({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""} ${big ? "text-[13px]" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
