"use client"

import { FileSpreadsheet, PackagePlus, Pencil, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyState, ErrorState, ExpiryBadge, LoadingState, LowStockBadge, PageHeader } from "@/components/common"
import { LoadMore } from "@/components/infinite-scroll"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebounce } from "@/hooks/use-debounce"
import { formatDate, formatMoney } from "@/lib/format"
import { useCategories, useInfiniteBatches, useInfiniteProducts } from "@/lib/queries"
import type { Batch, Product } from "@/lib/types"
import { cn } from "@/lib/utils"

import { BatchSheet } from "./batch-sheet"
import { ImportDialog } from "./import-dialog"
import { ProductSheet } from "./product-sheet"

const ALL = "all"

export default function InventoryPage() {
  const [tab, setTab] = useState("batches")
  const [productSheet, setProductSheet] = useState<{ open: boolean; product?: Product | null }>({ open: false })
  const [batchSheet, setBatchSheet] = useState<{ open: boolean; batch?: Batch | null; product?: Product | null }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <PageHeader
        title="Medicines & Stock"
        description="Everything you sell, how many you have, and when it expires."
        help={
          <>
            <strong>Medicines arrived?</strong> Press <strong>“Add stock”</strong> and follow the 4 easy steps. It works for
            new medicines and ones you already have. The oldest stock (earliest expiry) is always sold first,
            automatically.
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet /> Add many from Excel
            </Button>
            <Button asChild size="lg">
              <Link href="/inventory/add">
                <PackagePlus /> Add stock
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="batches" className="px-4">
            Stock on the shelf
          </TabsTrigger>
          <TabsTrigger value="products" className="px-4">
            Medicines list
          </TabsTrigger>
        </TabsList>
        <TabsContent value="batches">
          <BatchesTable onEdit={(batch) => setBatchSheet({ open: true, batch })} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTable onEdit={(product) => setProductSheet({ open: true, product })} />
        </TabsContent>
      </Tabs>

      <ProductSheet
        open={productSheet.open}
        product={productSheet.product}
        onOpenChange={(open) => setProductSheet((s) => ({ ...s, open }))}
        onCreated={(product) => setBatchSheet({ open: true, batch: null, product })}
      />
      <BatchSheet
        open={batchSheet.open}
        batch={batchSheet.batch}
        product={batchSheet.product}
        onOpenChange={(open) => setBatchSheet((s) => ({ ...s, open }))}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
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
        <SelectItem value={ALL}>All types</SelectItem>
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
  const debounced = useDebounce(search.trim())

  const batches = useInfiniteBatches({
    search: debounced,
    expiry_status: expiry === ALL ? undefined : expiry,
    category: category === ALL ? undefined : category,
    in_stock: stock === "in" ? true : stock === "empty" ? false : undefined,
    ordering: "expiry_date",
  })

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Search medicine name, code or batch…" />
          <CategoryFilter value={category} onChange={setCategory} />
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All expiry dates</SelectItem>
              <SelectItem value="ok">Good (not expiring soon)</SelectItem>
              <SelectItem value="expiring">Expiring within 90 days</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stock} onValueChange={setStock}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Stock">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">With stock left</SelectItem>
              <SelectItem value="empty">Used up</SelectItem>
              <SelectItem value={ALL}>Everything</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {batches.isError ? (
          <ErrorState error={batches.error} onRetry={() => batches.refetch()} />
        ) : batches.isLoading ? (
          <LoadingState rows={8} />
        ) : batches.items.length === 0 ? (
          <EmptyState title="Nothing to show" description="No stock matches. Change the search or filters above, or press “Add stock” when medicines arrive." />
        ) : (
          <div className={cn(batches.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch no.</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Cost</TableHead>
                  <TableHead className="text-right">Sale price</TableHead>
                  <TableHead className="text-right">In this delivery</TableHead>
                  <TableHead className="text-right">Total in stock</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.items.map((b) => {
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
                        <Button variant="outline" size="sm" onClick={() => onEdit(b)} aria-label={`Edit batch ${b.batch_no}`}>
                          <Pencil /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <LoadMore
              shown={batches.items.length}
              total={batches.count}
              hasNextPage={batches.hasNextPage}
              isFetchingNextPage={batches.isFetchingNextPage}
              fetchNextPage={batches.fetchNextPage}
              noun="deliveries"
            />
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
  const debounced = useDebounce(search.trim())

  const products = useInfiniteProducts({
    search: debounced,
    category: category === ALL ? undefined : category,
    low_stock: status === "low" ? true : undefined,
    is_active: status === "inactive" ? false : status === "active" ? true : undefined,
  })

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Search medicine name, code or type…" />
          <CategoryFilter value={category} onChange={setCategory} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All medicines</SelectItem>
              <SelectItem value="low">Running low</SelectItem>
              <SelectItem value="active">Available for sale</SelectItem>
              <SelectItem value="inactive">Hidden from sale</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.isLoading ? (
          <LoadingState rows={8} />
        ) : products.items.length === 0 ? (
          <EmptyState title="No medicines found" description="Change the search or filters above, or press “Add stock” to add a medicine." />
        ) : (
          <div className={cn(products.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Cost</TableHead>
                  <TableHead className="text-right">Sale price</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Warn at</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.items.map((p) => (
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
                        <span className="block text-xs font-normal text-red-700">+{p.stock - p.sellable_stock} expired (can’t sell)</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right tabular-nums text-muted-foreground">{p.reorder_level}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!p.is_active && <Badge variant="secondary">Hidden from sale</Badge>}
                        {p.is_low_stock && <LowStockBadge />}
                        {p.is_active && !p.is_low_stock && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            In stock
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm">
                          <Link href={`/inventory/add?product=${p.id}`} aria-label={`Add stock of ${p.name}`}>
                            <PackagePlus /> Add stock
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                          <Pencil /> Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <LoadMore
              shown={products.items.length}
              total={products.count}
              hasNextPage={products.hasNextPage}
              isFetchingNextPage={products.isFetchingNextPage}
              fetchNextPage={products.fetchNextPage}
              noun="medicines"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
