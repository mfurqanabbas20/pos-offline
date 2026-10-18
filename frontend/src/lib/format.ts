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
