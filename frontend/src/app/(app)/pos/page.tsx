"use client"

import { Banknote, CreditCard, Mic, MicOff, Minus, Plus, ScanBarcode, Search, ShoppingCart, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ErrorState, Spinner } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDebounce } from "@/hooks/use-debounce"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { api, ApiError } from "@/lib/api"
import { config } from "@/lib/config"
import { formatMoney, toDecimalString, toNumber } from "@/lib/format"
import { useCreateSale, useProducts } from "@/lib/queries"
import type { PaymentMethod, Product } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CartLine {
  product: Product
  quantity: number
}

const cents = (value: string | number) => Math.round(toNumber(value) * 100)
// Spoken units → the abbreviations used in product names ("500 milligrams" → "500 mg").
const SPOKEN_UNITS: [RegExp, string][] = [
  [/\bmilligrams?\b/gi, "mg"],
  [/\bmicrograms?\b/gi, "mcg"],
  [/\bmillilit(?:er|re)s?\b/gi, "ml"],
  [/\bgrams?\b/gi, "g"],
  [/\binternational units?\b/gi, "IU"],
  [/\bpercent\b/gi, "%"],
]

function normalizeSpokenQuery(text: string) {
  return SPOKEN_UNITS.reduce((q, [pattern, unit]) => q.replace(pattern, unit), text)
}

export default function PosPage() {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState("")
  const [payment, setPayment] = useState<PaymentMethod>("cash")
  const [received, setReceived] = useState("")
  const [customer, setCustomer] = useState("")
  const [cartOpen, setCartOpen] = useState(false)

  const debouncedQuery = useDebounce(query.trim(), 150)
  const products = useProducts({ search: debouncedQuery, is_active: true, page_size: 50, ordering: "name" })
  const createSale = useCreateSale()

  // Voice search: spoken words stream into the search box, which drives the normal product search.
  const speech = useSpeechRecognition({
    lang: config.speechLang,
    onInterim: setQuery,
    onResult: (text) => {
      setQuery(normalizeSpokenQuery(text))
      searchRef.current?.focus()
    },
    onError: (message) => toast.error(message),
  })
  const toggleVoice = () => (speech.listening ? speech.stop() : speech.start())

  // ---------- Cart ----------
  const addToCart = (product: Product) => {
    const inCart = cart.find((l) => l.product.id === product.id)?.quantity ?? 0
    if (inCart + 1 > product.sellable_stock) {
      toast.warning(`Only ${product.sellable_stock} of ${product.name} in stock.`)
      return
    }
    setCart((lines) =>
      inCart
        ? lines.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { product, quantity: 1 }],
    )
  }

  const setQuantity = (productId: number, quantity: number) => {
    setCart((lines) =>
      lines
        .map((l) => (l.product.id === productId ? { ...l, quantity: Math.min(Math.max(0, quantity), l.product.sellable_stock) } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  const onSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") setQuery("")
    if (event.key !== "Enter" || !query.trim()) return
    event.preventDefault()
    // Scanners type the barcode then press Enter: look for an exact SKU match first.
    try {
      const exact = await api.products.list({ barcode: query.trim(), is_active: true })
      const match = exact.results[0] ?? (products.data?.results.length === 1 ? products.data.results[0] : undefined)
      if (match) {
        addToCart(match)
        setQuery("")
      } else {
        toast.error(`No product found for "${query.trim()}".`)
      }
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  // ---------- Totals (in cents to avoid float drift) ----------
  const subtotalC = cart.reduce((sum, l) => sum + cents(l.product.selling_price) * l.quantity, 0)
  const discountC = Math.min(cents(discount), subtotalC)
  const totalC = subtotalC - discountC
  const receivedC = payment === "card" ? totalC : cents(received)
  const changeC = receivedC - totalC
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0)

  const discountTooHigh = cents(discount) > subtotalC && subtotalC > 0
  const insufficientCash = payment === "cash" && receivedC < totalC
  const canCheckout = cart.length > 0 && !discountTooHigh && !insufficientCash && !createSale.isPending

  const quickCash = useMemo(() => {
    const total = totalC / 100
    const options = new Set<number>([total])
    for (const step of [5, 10, 20, 50, 100]) options.add(Math.ceil(total / step) * step)
    return [...options].filter((v) => v >= total && v > 0).sort((a, b) => a - b).slice(0, 4)
  }, [totalC])

  const resetSale = () => {
    setCart([])
    setDiscount("")
    setReceived("")
    setCustomer("")
    setPayment("cash")
    setCartOpen(false)
    searchRef.current?.focus()
  }

  const completeSale = () => {
    createSale.mutate(
      {
        items: cart.map((l) => ({ product: l.product.id, quantity: l.quantity })),
        discount: toDecimalString(discountC / 100),
        payment_method: payment,
        amount_received: payment === "cash" ? toDecimalString(receivedC / 100) : null,
        customer_name: customer.trim(),
      },
      {
        onSuccess: (invoice) => {
          toast.success(`Sale ${invoice.number} completed`, {
            description: payment === "cash" ? `Change due: ${formatMoney(invoice.change_due)}` : undefined,
          })
          resetSale()
          router.push(`/receipt/${invoice.id}?print=1`)
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : "Could not complete the sale.")
          products.refetch() // stock may have changed under us
        },
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      {/* ---------- Product search ---------- */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">New sale</h1>
          <Button size="lg" variant={itemCount > 0 ? "default" : "outline"} onClick={() => setCartOpen(true)} className="relative">
            <ShoppingCart className="size-5" />
            <span>Cart</span>
            {itemCount > 0 && (
              <>
                <span className="tabular-nums">· {formatMoney(totalC / 100)}</span>
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background tabular-nums">
                  {itemCount}
                </span>
              </>
            )}
          </Button>
        </div>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={speech.listening ? "Listening… say a medicine name" : "Search by name, scan barcode or tap the mic…"}
            className={cn("h-14 rounded-xl pr-28 pl-12 text-lg", speech.listening && "border-primary ring-3 ring-primary/20")}
            aria-label="Search products"
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-5" />
              </button>
            ) : (
              <ScanBarcode className="pointer-events-none mx-2.5 size-5 text-muted-foreground" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant={speech.listening ? "default" : "ghost"}
                  onClick={toggleVoice}
                  disabled={!speech.supported}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? "Stop voice search" : "Search by voice"}
                  className={cn("relative rounded-lg", !speech.listening && "text-muted-foreground")}
                >
                  {speech.listening && <span className="absolute inset-0 animate-ping rounded-lg bg-primary/40" />}
                  {speech.supported ? <Mic className="relative size-5" /> : <MicOff className="size-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!speech.supported
                  ? "Voice search needs Chrome or Edge"
                  : speech.listening
                    ? "Listening… tap to stop"
                    : "Search by voice"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : products.data?.results.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No products match “{debouncedQuery}”.</p>
        ) : (
          <div className={cn("overflow-hidden rounded-xl border bg-card", products.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-44 pr-4 text-right">In cart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data?.results.map((product) => {
                  const inCart = cart.find((l) => l.product.id === product.id)?.quantity ?? 0
                  const out = product.sellable_stock <= 0
                  const add = () => {
                    if (out) return
                    addToCart(product)
                    searchRef.current?.focus()
                  }
                  return (
                    <TableRow
                      key={product.id}
                      onClick={add}
                      onKeyDown={(e) => e.key === "Enter" && add()}
                      tabIndex={out ? -1 : 0}
                      aria-disabled={out}
                      className={cn(
                        "h-16 cursor-pointer",
                        inCart > 0 && "bg-accent/50 hover:bg-accent/70",
                        out && "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <TableCell className="pl-4">
                        <p className="font-medium whitespace-normal">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{product.category_name}</TableCell>
                      <TableCell className="text-right text-base font-semibold tabular-nums">{formatMoney(product.selling_price)}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn("tabular-nums", out ? "text-destructive" : product.is_low_stock ? "font-medium text-orange-700" : "text-muted-foreground")}>
                          {out ? "Out of stock" : product.sellable_stock}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {inCart > 0 ? (
                            <>
                              <Button variant="outline" size="icon" onClick={() => setQuantity(product.id, inCart - 1)} aria-label={`Remove one ${product.name}`}>
                                <Minus />
                              </Button>
                              <span className="w-8 text-center font-semibold tabular-nums">{inCart}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={inCart >= product.sellable_stock}
                                onClick={add}
                                aria-label={`Add one ${product.name}`}
                              >
                                <Plus />
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" disabled={out} onClick={add} className="w-full max-w-28">
                              <Plus /> Add
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------- Cart & checkout (right drawer) ---------- */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b pr-14">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="size-5 text-primary" /> Cart
                {itemCount > 0 && <span className="text-sm font-normal text-muted-foreground">({itemCount} items)</span>}
              </SheetTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCart([])} className="text-muted-foreground">
                  Clear
                </Button>
              )}
            </div>
            <SheetDescription className="sr-only">Review items, take payment and complete the sale.</SheetDescription>
          </SheetHeader>
        {/* Middle scrolls; totals and the Complete button stay pinned at the bottom on short screens. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Tap a product or scan a barcode to start.</p>
          ) : (
            <ul className="space-y-2">
              {cart.map((line) => (
                <li key={line.product.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.product.name}</p>
                      <p className="text-xs text-muted-foreground">{formatMoney(line.product.selling_price)} each</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney((cents(line.product.selling_price) * line.quantity) / 100)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setQuantity(line.product.id, line.quantity - 1)} aria-label="Decrease">
                      <Minus />
                    </Button>
                    <Input
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.product.id, parseInt(e.target.value || "0", 10))}
                      className="w-16 text-center tabular-nums"
                      aria-label="Quantity"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={line.quantity >= line.product.sellable_stock}
                      onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                      aria-label="Increase"
                    >
                      <Plus />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => setQuantity(line.product.id, 0)}
                      aria-label="Remove"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="discount">Discount</Label>
              <Input
                id="discount"
                inputMode="decimal"
                placeholder="0.00"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={discountTooHigh}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer (optional)</Label>
              <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" />
            </div>
          </div>
          {discountTooHigh && <p className="text-sm text-destructive">Discount can’t exceed the subtotal.</p>}

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["cash", "Cash", Banknote],
                ["card", "Card", CreditCard],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                type="button"
                size="lg"
                variant={payment === value ? "default" : "outline"}
                onClick={() => setPayment(value)}
                aria-pressed={payment === value}
              >
                <Icon /> {label}
              </Button>
            ))}
          </div>

          {payment === "cash" && (
            <div className="space-y-2">
              <Label htmlFor="received">Amount received</Label>
              <Input
                id="received"
                inputMode="decimal"
                placeholder="0.00"
                value={received}
                onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-12 text-lg tabular-nums"
                aria-invalid={cart.length > 0 && received !== "" && insufficientCash}
              />
              {totalC > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quickCash.map((amount, i) => (
                    <Button key={amount} type="button" variant="secondary" size="sm" onClick={() => setReceived(amount.toFixed(2))}>
                      {i === 0 ? "Exact" : formatMoney(amount)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        <div className="space-y-3 border-t bg-background p-4">
          <dl className="space-y-1.5 rounded-xl bg-muted/60 p-4 text-sm">
            <Row label="Subtotal" value={formatMoney(subtotalC / 100)} />
            {discountC > 0 && <Row label="Discount" value={`− ${formatMoney(discountC / 100)}`} />}
            <Row label="Total" value={formatMoney(totalC / 100)} strong />
            {payment === "cash" && cart.length > 0 && (
              <Row
                label="Change"
                value={insufficientCash ? "—" : formatMoney(changeC / 100)}
                className={cn(!insufficientCash && "text-primary")}
              />
            )}
          </dl>

          <Button size="lg" className="h-14 w-full text-lg" disabled={!canCheckout} onClick={completeSale}>
            {createSale.isPending && <Spinner className="size-5" />}
            Complete sale
          </Button>
        </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between", strong && "border-t pt-2 text-lg font-semibold", className)}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
