/** Types mirroring the DRF API. Money values are serialized as decimal strings. */

export type Money = string

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  is_staff: boolean
}

export interface TokenPair {
  access: string
  refresh: string
}

export interface Category {
  id: number
  name: string
  product_count?: number
}

export interface Product {
  id: number
  name: string
  sku: string
  category: number
  category_name: string
  purchase_price: Money
  selling_price: Money
  reorder_level: number
  is_active: boolean
  stock: number
  sellable_stock: number
  is_low_stock: boolean
  created_at: string
  updated_at: string
}

export type ProductInput = Pick<
  Product,
  "name" | "sku" | "category" | "purchase_price" | "selling_price" | "reorder_level" | "is_active"
>

export type ExpiryStatus = "ok" | "expiring" | "expired"

export interface Batch {
  id: number
  product: number
  product_name: string
  product_sku: string
  batch_no: string
  expiry_date: string
  quantity: number
  purchase_price: Money
  selling_price: Money
  reorder_level: number
  days_to_expiry: number
  expiry_status: ExpiryStatus
  product_sellable_stock?: number
  created_at: string
}

export type BatchInput = Pick<Batch, "product" | "batch_no" | "expiry_date" | "quantity" | "purchase_price">

export interface InventoryReport {
  days: number
  low_stock: Product[]
  expiring: Batch[]
  expired: Batch[]
}

export type PaymentMethod = "cash" | "card"
export type InvoiceStatus = "paid" | "partially_returned" | "returned"

export interface InvoiceItem {
  id: number
  product: number
  product_name: string
  product_sku: string
  batch: number
  batch_no: string
  expiry_date: string
  quantity: number
  unit_price: Money
  unit_cost: Money
  line_total: Money
  returned_quantity: number
  returnable_quantity: number
}

export interface ReturnSummary {
  id: number
  number: string
  date: string
  reason: string
  refund_amount: Money
}

export interface Invoice {
  id: number
  number: string
  date: string
  customer_name: string
  subtotal: Money
  discount: Money
  total: Money
  payment_method: PaymentMethod
  amount_received: Money
  change_due: Money
  status: InvoiceStatus
  created_by: number
  created_by_name: string
  item_count: number
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[]
  returns: ReturnSummary[]
}

export interface SaleInput {
  items: { product: number; quantity: number }[]
  discount: string
  payment_method: PaymentMethod
  amount_received?: string | null
  customer_name?: string
}

export interface ReturnItem {
  id: number
  invoice_item: number
  product_name: string
  batch_no: string
  quantity: number
  unit_price: Money
  refund_amount: Money
}

export interface SalesReturn {
  id: number
  number: string
  invoice: number
  invoice_number: string
  date: string
  reason: string
  refund_amount: Money
  created_by: number
  created_by_name: string
  items: ReturnItem[]
}

export interface ReturnInput {
  invoice: number
  reason: string
  items: { invoice_item: number; quantity: number }[]
}

export interface DailyPoint {
  date: string
  sales: Money
  returns: Money
  net_sales: Money
  profit: Money
}

export interface TopProduct {
  product_id: number
  name: string
  sku: string
  quantity: number
  revenue: Money
}

export interface Dashboard {
  month: string
  total_sales: Money
  total_returns: Money
  net_revenue: Money
  total_profit: Money
  invoice_count: number
  daily: DailyPoint[]
  top_products: TopProduct[]
  low_stock_count: number
  expiring_count: number
  expired_count: number
  expiry_warning_days: number
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>
