/** Types mirroring the DRF API. Money values are serialized as decimal strings. */

export type Money = string

export interface Paginated<T> {
  count: number
  total_pages: number
  page: number
  page_size: number
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
  /** Pieces in one box. 1 = sold only as a whole unit. Stock and selling_price are per piece. */
  pieces_per_pack: number
  /** Box price if set; otherwise effective_pack_price = pieces × selling_price. */
  pack_price: Money | null
  effective_pack_price: Money
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
  "name" | "sku" | "category" | "purchase_price" | "selling_price" | "reorder_level" | "is_active" | "pieces_per_pack" | "pack_price"
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

/** Stock alerts. Each list holds at most `limit` rows; the *_count fields are the full totals. */
export interface InventoryReport {
  days: number
  limit: number
  low_stock: Product[]
  expiring: Batch[]
  expired: Batch[]
  low_stock_count: number
  expiring_count: number
  expired_count: number
}

export type PaymentMethod = "cash" | "card"
export type SaleUnit = "piece" | "pack"
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
  /** quantity is in pieces; a "pack" line was sold as whole boxes of pack_size. */
  sale_unit: SaleUnit
  pack_size: number
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
  items: { product: number; quantity: number; unit: SaleUnit }[]
  discount: string
  /** Percentage of the subtotal (0-100). When set, the server works out the discount amount. */
  discount_percent?: string | null
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

export interface ImportRow {
  row: number
  sku: string
  name: string
  product_action: "create" | "update"
  batch_action: "create" | ""
  quantity: number
  errors: string[]
}

export interface ImportResult {
  committed: boolean
  summary: {
    rows: number
    products_to_create: number
    products_to_update: number
    batches_to_create: number
    units_to_add: number
    error_rows: number
  }
  rows: ImportRow[]
}

export interface ReceiveStockInput {
  product?: number
  new_product?: { name: string; sku?: string; category: string; reorder_level?: number }
  quantity: number
  expiry_date: string
  batch_no?: string
  total_cost?: string | null
  selling_price?: string | null
  pieces_per_pack?: number
  pack_price?: string | null
}

export interface ReceiveStockResult {
  created_product: boolean
  product: Product
  batch: Batch
}
