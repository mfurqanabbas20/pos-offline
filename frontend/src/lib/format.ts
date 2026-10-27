import { config } from "./config"

const currencyFormat = new Intl.NumberFormat(config.locale, {
  style: "currency",
  currency: config.currency,
  minimumFractionDigits: 2,
})

const compactFormat = new Intl.NumberFormat(config.locale, { notation: "compact", maximumFractionDigits: 1 })

export function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "")
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(value: string | number | null | undefined): string {
  return currencyFormat.format(toNumber(value))
}

export function formatCompact(value: string | number): string {
  return compactFormat.format(toNumber(value))
}

/** Round to cents and render as an API decimal string. */
export function toDecimalString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? parseDate(value) : value
  return date.toLocaleDateString(config.locale, { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString(config.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Parse "YYYY-MM-DD" as a local date (not UTC midnight). */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(config.locale, { month: "long", year: "numeric" })
}

/** A person's name for screens and receipts: the generic "admin" owner login shows as the owner's name. */
export function displayName(name: string | null | undefined): string {
  const value = (name ?? "").trim()
  return !value || /\badmin\b/i.test(value) ? config.pharmacy.owner : value
}

/** Plain amount without the currency sign, e.g. "1,250.00" (receipt columns). */
export function formatAmount(value: string | number | null | undefined): string {
  return toNumber(value).toLocaleString(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "27/10/26 06:34PM" or, with seconds, "27/10/2026 06:34:33 PM" (receipt style). */
export function formatReceiptDate(value: string | Date, long = false): string {
  const d = typeof value === "string" ? new Date(value) : value
  const p = (n: number) => String(n).padStart(2, "0")
  const h = d.getHours() % 12 || 12
  const ampm = d.getHours() < 12 ? "AM" : "PM"
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${long ? d.getFullYear() : p(d.getFullYear() % 100)}`
  return long ? `${date} ${p(h)}:${p(d.getMinutes())}:${p(d.getSeconds())} ${ampm}` : `${date} ${p(h)}:${p(d.getMinutes())}${ampm}`
}

/** "10%" from a discount amount and the subtotal it came off (2 decimals max, trailing zeros dropped). */
export function discountPercentLabel(discount: string | number, subtotal: string | number): string {
  const sub = toNumber(subtotal)
  if (!sub) return ""
  return `${Number(((toNumber(discount) / sub) * 100).toFixed(2))}%`
}
