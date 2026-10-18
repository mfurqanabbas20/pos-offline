"use client"

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCompact, formatMoney, parseDate, toNumber } from "@/lib/format"
import type { DailyPoint } from "@/lib/types"

const TEAL = "var(--chart-1)"
const SLATE = "var(--chart-2)"

export function SalesChart({ data }: { data: DailyPoint[] }) {
  const points = data.map((d) => ({
    day: parseDate(d.date).getDate(),
    date: d.date,
    sales: toNumber(d.net_sales),
    profit: toNumber(d.profit),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.25} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => formatCompact(v)}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }}
          labelFormatter={(_, payload) => {
            const date = payload?.[0]?.payload?.date as string | undefined
            return date ? parseDate(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : ""
          }}
          formatter={(value) => formatMoney(Number(value))}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
        <Area type="monotone" dataKey="sales" name="Net sales" stroke={TEAL} strokeWidth={2} fill="url(#salesFill)" />
        <Line type="monotone" dataKey="profit" name="Profit" stroke={SLATE} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
