"use client"

import { Banknote, Check, CreditCard, Mic, MicOff, Minus, Pill, Plus, ScanBarcode, Search, ShoppingCart, Trash2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, Spinner } from "@/components/common"
import { LoadMore } from "@/components/infinite-scroll"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDebounce } from "@/hooks/use-debounce"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { api, ApiError } from "@/lib/api"
import { config } from "@/lib/config"
import { formatMoney, toDecimalString, toNumber } from "@/lib/format"
import { useCreateSale, useInfiniteProducts } from "@/lib/queries"
import type { PaymentMethod, Product, SaleUnit } from "@/lib/types"
import { cn } from "@/lib/utils"
import { receiptHref } from "@/lib/routes"

/** One bill line per medicine *and* unit: "Hyper (box of 10) × 2" and "Hyper (loose) × 3" are separate lines. */
interface CartLine {
  product: Product
  unit: SaleUnit
  quantity: number
}

const cents = (value: string | number) => Math.round(toNumber(value) * 100)
const boxed = (p: Product) => p.pieces_per_pack > 1
const piecesPer = (p: Product, unit: SaleUnit) => (unit === "pack" ? p.pieces_per_pack : 1)
const priceOf = (p: Product, unit: SaleUnit) => (unit === "pack" ? p.effective_pack_price : p.selling_price)
const sameLine = (l: CartLine, productId: number, unit: SaleUnit) => l.product.id === productId && l.unit === unit
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Pieces of a product already on the bill, optionally ignoring one line. */
function piecesOnBill(cart: CartLine[], productId: number, except?: SaleUnit) {
  return cart
    .filter((l) => l.product.id === productId && l.unit !== except)
    .reduce((sum, l) => sum + l.quantity * piecesPer(l.product, l.unit), 0)
}

/** "2 boxes + 3 loose" / "3" — what of this medicine is on the bill. */
function billSummary(cart: CartLine[], product: Product) {
  const box = cart.find((l) => sameLine(l, product.id, "pack"))?.quantity ?? 0
  const loose = cart.find((l) => sameLine(l, product.id, "piece"))?.quantity ?? 0
  if (!boxed(product)) return loose ? String(loose) : ""
  return [box && plural(box, "box", "boxes"), loose && `${loose} loose`].filter(Boolean).join(" + ")
}

/** "200 (20 boxes)" for boxed medicines. */
function stockText(p: Product) {
  if (!boxed(p)) return String(p.sellable_stock)
  const boxes = Math.floor(p.sellable_stock / p.pieces_per_pack)
  return `${p.sellable_stock} (${plural(boxes, "box", "boxes")})`
}
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
  // Discount is entered as a percentage of the bill (e.g. "10" = 10% off).
  const [discount, setDiscount] = useState("")
  const [payment, setPayment] = useState<PaymentMethod>("cash")
  const [received, setReceived] = useState("")
  const [customer, setCustomer] = useState("")
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const debouncedQuery = useDebounce(query.trim(), 150)
  const products = useInfiniteProducts({ search: debouncedQuery, is_active: true, ordering: "name" })
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
  const addToCart = (product: Product, unit: SaleUnit = "piece") => {
    const per = piecesPer(product, unit)
    const left = product.sellable_stock - piecesOnBill(cart, product.id)
    if (per > left) {
      toast.warning(
        unit === "pack"
          ? `Not enough for a full box of ${product.name}: only ${plural(left, "piece", "pieces")} left. Sell them loose instead.`
          : `No more ${product.name} left in stock.`,
      )
      return
    }
    const existing = cart.find((l) => sameLine(l, product.id, unit))
    const next: CartLine[] = existing
      ? cart.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l))
      : [...cart, { product, unit, quantity: 1 }]
    setCart(next)
    // One reusable toast so rapid taps update it instead of stacking.
    toast.success(unit === "pack" ? `Added 1 box of ${product.name}` : `Added ${product.name}`, {
      id: "added-to-bill",
      description: `On the bill: ${billSummary(next, product)}`,
      duration: 1500,
    })
  }

  /** Set a line's quantity, capped so all lines of that medicine fit in the stock. */
  const setQuantity = (productId: number, unit: SaleUnit, quantity: number) => {
    setCart((lines) =>
      lines
        .map((l) => {
          if (!sameLine(l, productId, unit)) return l
          const room = l.product.sellable_stock - piecesOnBill(lines, productId, unit)
          const max = Math.floor(room / piecesPer(l.product, unit))
          return { ...l, quantity: Math.min(Math.max(0, quantity || 0), max) }
        })
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
      const match = exact.results[0] ?? (products.count === 1 ? products.items[0] : undefined)
      if (match) {
        addToCart(match, boxed(match) ? "pack" : "piece")
        setQuery("")
      } else {
        toast.error(`No medicine found for "${query.trim()}". Check the spelling or barcode.`)
      }
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  // ---------- Totals (in cents to avoid float drift) ----------
  const subtotalC = cart.reduce((sum, l) => sum + cents(priceOf(l.product, l.unit)) * l.quantity, 0)
  const discountPct = Math.min(toNumber(discount), 100)
  // Same rounding as the server (half-up to the paisa), so the screen and receipt always agree.
  const discountC = Math.round((subtotalC * discountPct) / 100)
  const totalC = subtotalC - discountC
  const receivedC = payment === "card" ? totalC : cents(received)
  const changeC = receivedC - totalC
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0)

  const discountTooHigh = toNumber(discount) > 100
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
        items: cart.map((l) => ({ product: l.product.id, quantity: l.quantity, unit: l.unit })),
        discount: "0",
        discount_percent: discountPct > 0 ? toDecimalString(discountPct) : null,
        payment_method: payment,
        amount_received: payment === "cash" ? toDecimalString(receivedC / 100) : null,
        customer_name: customer.trim(),
      },
      {
        onSuccess: (invoice) => {
          toast.success("Sale complete. The receipt is printing.", {
            description: payment === "cash" ? `Give back ${formatMoney(invoice.change_due)} change.` : undefined,
            duration: 6000,
          })
          resetSale()
          router.push(receiptHref(invoice.id, true))
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : "The sale could not be saved. Please try again.")
          products.refetch() // stock may have changed under us
        },
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      {/* ---------- Product search ---------- */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">New sale</h1>
          <Button
            size="lg"
            variant={itemCount > 0 ? "default" : "outline"}
            onClick={() => setCartOpen(true)}
            className="relative h-14 px-6 text-lg"
          >
            <ShoppingCart className="size-6" />
            {itemCount > 0 ? (
              <>
                <span>Checkout</span>
                <span className="tabular-nums">· {formatMoney(totalC / 100)}</span>
                <span className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background tabular-nums">
                  {itemCount}
                </span>
              </>
            ) : (
              <span>Bill is empty</span>
            )}
          </Button>
        </div>
        <ol className="mb-4 grid gap-2 sm:grid-cols-3">
          <Step n={1} done={itemCount > 0}>Find the medicine below</Step>
          <Step n={2} done={itemCount > 0}>Press <strong>Add</strong> to put it on the bill</Step>
          <Step n={3}>Press <strong>Checkout</strong> to take payment</Step>
        </ol>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={speech.listening ? "Listening… say the medicine name now" : "Type a medicine name, or scan its barcode"}
            className={cn("h-14 rounded-xl pr-28 pl-12 text-lg", speech.listening && "border-primary ring-3 ring-primary/20")}
            aria-label="Search medicines"
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
                    : "Tap and say the medicine name"}
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
        ) : products.items.length === 0 ? (
          debouncedQuery ? (
            <EmptyState
              icon={Search}
              title={`No medicine matches “${debouncedQuery}”`}
              description="Check the spelling, or type just the first few letters (for example “pana” for Panadol)."
              action={<Button variant="outline" onClick={() => setQuery("")}>Clear the search</Button>}
            />
          ) : (
            <EmptyState
              icon={Pill}
              title="No medicines added yet"
              description="Before you can sell, add your medicines and their stock."
              action={
                <Button asChild size="lg">
                  <Link href="/inventory/add">Add medicines</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className={cn("overflow-hidden rounded-xl border bg-card", products.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Medicine</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="w-52 pr-4 text-right">Add to bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.items.map((product) => {
                  const looseOnBill = cart.find((l) => sameLine(l, product.id, "piece"))?.quantity ?? 0
                  const onBill = billSummary(cart, product)
                  const out = product.sellable_stock <= 0
                  const add = (unit: SaleUnit = "piece") => {
                    if (out) return
                    addToCart(product, unit)
                    searchRef.current?.focus()
                  }
                  const piecesLeft = product.sellable_stock - piecesOnBill(cart, product.id)
                  return (
                    <TableRow
                      key={product.id}
                      onClick={() => add()}
                      onKeyDown={(e) => e.key === "Enter" && add()}
                      tabIndex={out ? -1 : 0}
                      aria-disabled={out}
                      className={cn(
                        "h-16 cursor-pointer",
                        onBill && "bg-accent/50 hover:bg-accent/70",
                        out && "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <TableCell className="pl-4">
                        <p className="font-medium whitespace-normal">{product.name}</p>
                        <p className="text-xs text-muted-foreground">Code: {product.sku}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{product.category_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <p className="text-base font-semibold">
                          {formatMoney(product.selling_price)}
                          {boxed(product) && <span className="text-xs font-normal text-muted-foreground"> / piece</span>}
                        </p>
                        {boxed(product) && (
                          <p className="text-xs text-muted-foreground">
                            Box of {product.pieces_per_pack}: {formatMoney(product.effective_pack_price)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("tabular-nums", out ? "text-destructive" : product.is_low_stock ? "font-medium text-orange-700" : "text-muted-foreground")}>
                          {out ? "None left" : product.is_low_stock ? `${stockText(product)} · low` : stockText(product)}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        {boxed(product) ? (
                          // Boxed medicine: sell a whole box, or loose pieces cut from a box.
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex gap-1.5">
                              <Button
                                variant="outline"
                                disabled={out || piecesLeft < 1}
                                onClick={() => add("piece")}
                                aria-label={`Add one loose piece of ${product.name}`}
                              >
                                <Plus /> Piece
                              </Button>
                              <Button
                                disabled={out || piecesLeft < product.pieces_per_pack}
                                onClick={() => add("pack")}
                                aria-label={`Add one box of ${product.name}`}
                              >
                                <Plus /> Box
                              </Button>
                            </div>
                            {onBill && <span className="text-xs font-medium text-accent-foreground">On bill: {onBill}</span>}
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {looseOnBill > 0 ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setQuantity(product.id, "piece", looseOnBill - 1)}
                                  aria-label={`Remove one ${product.name}`}
                                >
                                  <Minus />
                                </Button>
                                <span className="w-8 text-center font-semibold tabular-nums">{looseOnBill}</span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  disabled={piecesLeft < 1}
                                  onClick={() => add()}
                                  aria-label={`Add one ${product.name}`}
                                >
                                  <Plus />
                                </Button>
                              </>
                            ) : (
                              <Button disabled={out} onClick={() => add()} className="w-full max-w-28">
                                <Plus /> Add
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {products.items.length > 0 && (
          <LoadMore
            shown={products.items.length}
            total={products.count}
            hasNextPage={products.hasNextPage}
            isFetchingNextPage={products.isFetchingNextPage}
            fetchNextPage={products.fetchNextPage}
            noun="medicines"
          />
        )}
      </section>

      {/* ---------- Checkout: a large window, items on the left, payment on the right ---------- */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="flex h-[min(94vh,820px)] w-[min(96vw,1180px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-4 pr-14">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <ShoppingCart className="size-6 text-primary" /> Checkout
              {itemCount > 0 && (
                <span className="text-base font-normal whitespace-nowrap text-muted-foreground">
                  · {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Check the items, take payment and finish the sale.</DialogDescription>
            {cart.length > 0 && (
              <Button
                variant={confirmClear ? "destructive" : "ghost"}
                onClick={() => {
                  if (confirmClear) {
                    setCart([])
                    setConfirmClear(false)
                  } else {
                    setConfirmClear(true)
                  }
                }}
                onBlur={() => setConfirmClear(false)}
                className={cn(!confirmClear && "text-muted-foreground")}
              >
                <Trash2 /> {confirmClear ? "Tap again to remove all" : "Remove all"}
              </Button>
            )}
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_400px] md:grid-rows-1">
            {/* ----- Left: the items ----- */}
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
                    <ShoppingCart className="size-10" />
                    <p className="text-lg">The bill is empty.</p>
                    <Button variant="outline" onClick={() => setCartOpen(false)}>
                      Go back and add medicines
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {cart.map((line) => {
                      const each = priceOf(line.product, line.unit)
                      return (
                        <li key={`${line.product.id}:${line.unit}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                          <div className="min-w-48 flex-1">
                            <p className="font-medium">{line.product.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {line.unit === "pack" ? (
                                <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                                  Box of {line.product.pieces_per_pack}
                                </span>
                              ) : (
                                boxed(line.product) && (
                                  <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">Loose piece</span>
                                )
                              )}
                              {formatMoney(each)} each
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setQuantity(line.product.id, line.unit, line.quantity - 1)}
                              aria-label={`One less ${line.product.name}`}
                            >
                              <Minus />
                            </Button>
                            <Input
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => setQuantity(line.product.id, line.unit, parseInt(e.target.value || "0", 10))}
                              className="w-14 text-center text-base font-semibold tabular-nums"
                              aria-label={`Quantity of ${line.product.name}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={piecesOnBill(cart, line.product.id) + piecesPer(line.product, line.unit) > line.product.sellable_stock}
                              onClick={() => setQuantity(line.product.id, line.unit, line.quantity + 1)}
                              aria-label={`One more ${line.product.name}`}
                            >
                              <Plus />
                            </Button>
                          </div>
                          <span className="w-28 text-right text-lg font-semibold tabular-nums">
                            {formatMoney((cents(each) * line.quantity) / 100)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setQuantity(line.product.id, line.unit, 0)}
                            aria-label={`Remove ${line.product.name} from the bill`}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {cart.length > 0 && (
                <div className="grid gap-3 border-t bg-muted/30 px-5 py-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="discount">Discount (%)</Label>
                    <div className="relative">
                      <Input
                        id="discount"
                        inputMode="decimal"
                        placeholder="0"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, "").replace(/(\.\d{0,2}).*$/, "$1"))}
                        aria-invalid={discountTooHigh}
                        className="pr-9"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-medium text-muted-foreground">%</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[5, 10, 15, 20].map((pct) => (
                        <Button
                          key={pct}
                          type="button"
                          size="sm"
                          variant={discountPct === pct ? "default" : "secondary"}
                          onClick={() => setDiscount(discountPct === pct ? "" : String(pct))}
                        >
                          {pct}%
                        </Button>
                      ))}
                      {discountC > 0 && !discountTooHigh && (
                        <span className="ml-1 text-sm font-medium text-primary">= {formatMoney(discountC / 100)} off</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer">Customer name</Label>
                    <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" />
                  </div>
                  {discountTooHigh && (
                    <p className="text-sm text-destructive sm:col-span-2">A discount can’t be more than 100%. Please lower it.</p>
                  )}
                </div>
              )}
            </div>

            {/* ----- Right: payment, always fully visible ----- */}
            <div className="flex min-h-0 flex-col border-t bg-muted/20 md:border-t-0 md:border-l">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-border">
                  <span>
                    <span className="block font-medium">Total to collect</span>
                    {discountC > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {formatMoney(subtotalC / 100)} − {discountPct}% discount ({formatMoney(discountC / 100)})
                      </span>
                    )}
                  </span>
                  <span className="text-3xl font-bold tabular-nums">{formatMoney(totalC / 100)}</span>
                </div>

                <div className="space-y-2">
                  <p className="font-medium">How is the customer paying?</p>
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
                        variant={payment === value ? "default" : "outline"}
                        onClick={() => setPayment(value)}
                        aria-pressed={payment === value}
                        className="h-12 text-base"
                      >
                        <Icon /> {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {payment === "cash" && (
                  <div className="space-y-2">
                    <Label htmlFor="received" className="text-base">
                      Cash received from the customer
                    </Label>
                    <Input
                      id="received"
                      inputMode="decimal"
                      placeholder="Type the amount, e.g. 500"
                      value={received}
                      onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))}
                      className="h-14 text-xl tabular-nums"
                      aria-invalid={cart.length > 0 && received !== "" && insufficientCash}
                    />
                    {totalC > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {quickCash.map((amount, i) => (
                          <Button key={amount} type="button" variant="secondary" onClick={() => setReceived(amount.toFixed(2))}>
                            {i === 0 ? "Exact amount" : formatMoney(amount)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {payment === "cash" &&
                  cart.length > 0 &&
                  received !== "" &&
                  (insufficientCash ? (
                    <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-lg font-medium text-red-700">
                      {formatMoney((totalC - receivedC) / 100)} more is needed
                    </p>
                  ) : (
                    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-emerald-800">
                      <p>Give back to the customer</p>
                      <p className="text-3xl font-bold tabular-nums">{formatMoney(changeC / 100)}</p>
                    </div>
                  ))}
              </div>

              <div className="space-y-2 border-t bg-background p-5">
                <Button size="lg" className="h-14 w-full text-lg" disabled={!canCheckout} onClick={completeSale}>
                  {createSale.isPending && <Spinner className="size-5" />}
                  Finish sale &amp; print receipt
                </Button>
                {!canCheckout && !createSale.isPending && (
                  <p className="text-center text-sm text-muted-foreground">
                    {cart.length === 0
                      ? "Add at least one medicine to the bill."
                      : discountTooHigh
                        ? "Lower the discount to 100% or less to continue."
                        : "Enter the cash you received to continue."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Step({ n, done, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border bg-card px-4 py-3", done && "border-primary/30 bg-accent/40")}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <span>{children}</span>
    </li>
  )
}
