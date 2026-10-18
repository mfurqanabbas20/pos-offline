"use client"

import { PackagePlus, Pencil, Plus, Search } from "lucide-react"
import { useState } from "react"

import { EmptyState, ErrorState, ExpiryBadge, LoadingState, LowStockBadge, PageHeader, Pagination } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDate, formatMoney } from "@/lib/format"
import { useBatches, useCategories, useProducts } from "@/lib/queries"
import type { Batch, Product } from "@/lib/types"
import { cn } from "@/lib/utils"

import { BatchSheet } from "./batch-sheet"
import { ProductSheet } from "./product-sheet"

const PAGE_SIZE = 20
const ALL = "all"

export default function InventoryPage() {
  const [tab, setTab] = useState("batches")
  const [productSheet, setProductSheet] = useState<{ open: boolean; product?: Product | null }>({ open: false })
  const [batchSheet, setBatchSheet] = useState<{ open: boolean; batch?: Batch | null }>({ open: false })

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <PageHeader
        title="Inventory"
        description="Stock is tracked per batch. Products sell from the earliest-expiring batch first."
        actions={
          <>
            <Button variant="outline" onClick={() => setProductSheet({ open: true, product: null })}>
              <Plus /> Add product
            </Button>
            <Button onClick={() => setBatchSheet({ open: true, batch: null })}>
              <PackagePlus /> Receive stock
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="batches" className="px-4">
            Stock by batch
          </TabsTrigger>
          <TabsTrigger value="products" className="px-4">
            Products
          </TabsTrigger>
        </TabsList>
        <TabsContent value="batches">
          <BatchesTable onEdit={(batch) => setBatchSheet({ open: true, batch })} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTable onEdit={(product) => setProductSheet({ open: true, product })} />
        </TabsContent>
      </Tabs>

      <ProductSheet open={productSheet.open} product={productSheet.product} onOpenChange={(open) => setProductSheet((s) => ({ ...s, open }))} />
      <BatchSheet open={batchSheet.open} batch={batchSheet.batch} onOpenChange={(open) => setBatchSheet((s) => ({ ...s, open }))} />
    </div>
  )
}

function CategoryFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const categories = useCategories()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-48" aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All categories</SelectItem>
        {categories.data?.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-56 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  )
}

function BatchesTable({ onEdit }: { onEdit: (batch: Batch) => void }) {
  const [search, setSearch] = useState("")
  const [expiry, setExpiry] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [stock, setStock] = useState("in")
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim())

  const batches = useBatches({
    search: debounced,
    expiry_status: expiry === ALL ? undefined : expiry,
    category: category === ALL ? undefined : category,
    in_stock: stock === "in" ? true : stock === "empty" ? false : undefined,
    page,
    page_size: PAGE_SIZE,
    ordering: "expiry_date",
  })
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SearchBox value={search} onChange={resetPage(setSearch)} placeholder="Search product, SKU or batch…" />
          <CategoryFilter value={category} onChange={resetPage(setCategory)} />
          <Select value={expiry} onValueChange={resetPage(setExpiry)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any expiry</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="expiring">Expiring ≤ 90 days</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stock} onValueChange={resetPage(setStock)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Stock">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="empty">Empty batches</SelectItem>
              <SelectItem value={ALL}>All batches</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {batches.isError ? (
          <ErrorState error={batches.error} onRetry={() => batches.refetch()} />
        ) : batches.isLoading ? (
          <LoadingState rows={8} />
        ) : batches.data?.results.length === 0 ? (
          <EmptyState title="No batches found" description="Try different filters, or receive new stock." />
        ) : (
          <div className={cn(batches.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Batch qty</TableHead>
                  <TableHead className="text-right">Product stock</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.data?.results.map((b) => {
                  const low = (b.product_sellable_stock ?? 0) <= b.reorder_level
                  return (
                    <TableRow key={b.id} className="h-14">
                      <TableCell>
                        <p className="font-medium">{b.product_name}</p>
                        <p className="text-xs text-muted-foreground">{b.product_sku}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.batch_no}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm">{formatDate(b.expiry_date)}</span>
                          <ExpiryBadge status={b.expiry_status} days={b.days_to_expiry} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-right tabular-nums">{formatMoney(b.purchase_price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(b.selling_price)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{b.quantity}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="tabular-nums">{b.product_sellable_stock ?? "–"}</span>
                          {low && <LowStockBadge />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => onEdit(b)} aria-label={`Edit batch ${b.batch_no}`}>
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} count={batches.data?.count ?? 0} onPageChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProductsTable({ onEdit }: { onEdit: (product: Product) => void }) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim())

  const products = useProducts({
    search: debounced,
    category: category === ALL ? undefined : category,
    low_stock: status === "low" ? true : undefined,
    is_active: status === "inactive" ? false : status === "active" ? true : undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SearchBox value={search} onChange={resetPage(setSearch)} placeholder="Search name, SKU or category…" />
          <CategoryFilter value={category} onChange={resetPage(setCategory)} />
          <Select value={status} onValueChange={resetPage(setStatus)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.isLoading ? (
          <LoadingState rows={8} />
        ) : products.data?.results.length === 0 ? (
          <EmptyState title="No products found" />
        ) : (
          <div className={cn(products.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Sellable stock</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Reorder at</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data?.results.map((p) => (
                  <TableRow key={p.id} className="h-14">
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.category_name}</TableCell>
                    <TableCell className="hidden xl:table-cell text-right tabular-nums">{formatMoney(p.purchase_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.selling_price)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {p.sellable_stock}
                      {p.stock !== p.sellable_stock && (
                        <span className="block text-xs font-normal text-red-700">+{p.stock - p.sellable_stock} expired</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right tabular-nums text-muted-foreground">{p.reorder_level}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                        {p.is_low_stock && <LowStockBadge />}
                        {p.is_active && !p.is_low_stock && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            In stock
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} count={products.data?.count ?? 0} onPageChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
