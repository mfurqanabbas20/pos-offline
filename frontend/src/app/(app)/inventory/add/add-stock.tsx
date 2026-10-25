"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  Mic,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useId, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ErrorState, HelpTip, LoadingState, Spinner } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebounce } from "@/hooks/use-debounce"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { api, ApiError } from "@/lib/api"
import { config } from "@/lib/config"
import { formatMoney, toDecimalString, toNumber } from "@/lib/format"
import { useCategories, useProducts, useReceiveStock } from "@/lib/queries"
import type { Product, ReceiveStockResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const STEPS = [
  { title: "Medicine", icon: Search },
  { title: "Quantity & expiry", icon: CalendarClock },
  { title: "Price", icon: Wallet },
  { title: "Check & save", icon: Check },
] as const

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Reads ?product=<id> (from "Add stock" buttons elsewhere) and starts the wizard on that medicine. */
export function AddStockFlow() {
  const productId = Number(useSearchParams().get("product")) || null
  const [round, setRound] = useState(0)
  const preselected = useQuery({
    queryKey: ["product", productId],
    queryFn: () => api.products.get(productId!),
    enabled: !!productId,
  })

  if (productId && preselected.isLoading) return <LoadingState rows={6} className="mx-auto max-w-3xl" />
  if (productId && preselected.isError) return <ErrorState error={preselected.error} onRetry={() => preselected.refetch()} />

  // `key` remounts the wizard for "Add another delivery", giving a clean start without resetting state by hand.
  return (
    <AddStockWizard
      key={round}
      initialProduct={round === 0 ? (preselected.data ?? null) : null}
      onAddAnother={() => setRound((r) => r + 1)}
    />
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

function daysIn(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** Boxes often print only month/year ("EXP 09/2028"): then the medicine is good until the end of that month. */
const DAY_NOT_ON_BOX = "end"

function AddStockWizard({ initialProduct, onAddAnother }: { initialProduct: Product | null; onAddAnother: () => void }) {
  const [step, setStep] = useState(initialProduct ? 2 : 1)
  const [product, setProduct] = useState<Product | null>(initialProduct)
  const [isNew, setIsNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newSku, setNewSku] = useState("")
  const [newCategory, setNewCategory] = useState("")
  const [boxes, setBoxes] = useState(1)
  const [perBox, setPerBox] = useState(initialProduct?.pieces_per_pack ?? 1)
  const [expDay, setExpDay] = useState(DAY_NOT_ON_BOX)
  const [expMonth, setExpMonth] = useState("")
  const [expYear, setExpYear] = useState("")
  const [batchNo, setBatchNo] = useState("")
  const [showBatch, setShowBatch] = useState(false)
  const [totalPaid, setTotalPaid] = useState("")
  const [salePrice, setSalePrice] = useState(initialProduct ? initialProduct.selling_price : "")
  const [boxPrice, setBoxPrice] = useState(initialProduct?.pack_price ?? "")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReceiveStockResult | null>(null)
  const receive = useReceiveStock()

  const quantity = boxes * perBox
  const unitCost = totalPaid !== "" && quantity > 0 ? toNumber(totalPaid) / quantity : product && !isNew ? toNumber(product.purchase_price) : null
  const sale = salePrice === "" ? null : toNumber(salePrice)
  const profit = unitCost !== null && sale !== null ? sale - unitCost : null
  const medicineName = isNew ? newName.trim() : (product?.name ?? "")
  const boxPriceTooLow = perBox > 1 && boxPrice !== "" && unitCost !== null && toNumber(boxPrice) < unitCost * perBox

  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  // Days offered match the chosen month (no 31 Sep; 29 Feb only in leap years).
  const monthDays = expMonth ? daysIn(Number(expYear) || now.getFullYear(), Number(expMonth)) : 31
  const dayExact = expDay !== DAY_NOT_ON_BOX
  const day = dayExact ? Math.min(Number(expDay), monthDays) : monthDays
  const expiryDate = expMonth && expYear ? `${expYear}-${pad(Number(expMonth))}-${pad(day)}` : null
  const expiryPast = expiryDate !== null && expiryDate < today
  const expiryLabel = expiryDate
    ? dayExact
      ? `${day} ${MONTHS[Number(expMonth) - 1]} ${expYear}`
      : `${MONTHS[Number(expMonth) - 1]} ${expYear} (end of month)`
    : "—"

  // ---------- step validation: a plain sentence saying what is missing ----------
  const problem = (() => {
    if (step === 1) {
      if (!isNew && !product) return "Choose a medicine from the list, or add a new one."
      if (isNew && !newName.trim()) return "Type the medicine name."
      if (isNew && !newCategory.trim()) return "Choose or type the type of medicine."
    }
    if (step === 2) {
      if (quantity < 1) return "Enter how many arrived."
      if (!expiryDate) return "Choose the expiry month and year from the box."
      if (expiryPast) return "That expiry date has already passed. Check the box again."
    }
    if (step === 3) {
      if (isNew && totalPaid === "") return "Enter how much you paid for this delivery."
      if (sale === null || sale <= 0) return "Enter the price the customer pays for one."
      if (unitCost !== null && sale < unitCost) return `Raise the customer price to at least ${formatMoney(unitCost)} to continue.`
      if (boxPriceTooLow) return "Raise the box price, or leave it empty."
    }
    return null
  })()

  const next = () => {
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setStep((s) => Math.min(4, s + 1))
  }
  const back = () => {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  const save = () => {
    setError(null)
    receive.mutate(
      {
        ...(isNew
          ? { new_product: { name: newName.trim(), sku: newSku.trim(), category: newCategory.trim() } }
          : { product: product!.id }),
        quantity,
        expiry_date: expiryDate!,
        batch_no: batchNo.trim(),
        total_cost: totalPaid === "" ? null : toDecimalString(toNumber(totalPaid)),
        selling_price: sale === null ? null : toDecimalString(sale),
        // Remember the box size so the sale screen can offer "+ Box" and "+ Piece".
        pieces_per_pack: perBox,
        pack_price: perBox > 1 && boxPrice !== "" ? toDecimalString(toNumber(boxPrice)) : null,
      },
      {
        onSuccess: (res) => {
          setResult(res)
          toast.success(`Added ${quantity} ${res.product.name}`)
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save. Please try again."),
      },
    )
  }

  if (result) return <Done result={result} quantity={quantity} onAddAnother={onAddAnother} />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Button asChild variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <Link href="/inventory">
          <ArrowLeft /> Medicines &amp; Stock
        </Link>
      </Button>
      <h1 className="text-3xl font-semibold tracking-tight">Add stock</h1>
      <p className="mt-1.5 mb-6 text-muted-foreground">Use this every time medicines arrive. Just follow the 4 steps.</p>

      <Stepper step={step} />

      <Card className="mt-6">
        <CardContent className="space-y-6 py-2">
          {step === 1 && (
            <StepMedicine
              product={product}
              isNew={isNew}
              newName={newName}
              newSku={newSku}
              newCategory={newCategory}
              onChoose={(p) => {
                setProduct(p)
                setIsNew(false)
                setSalePrice(p.selling_price)
                setPerBox(p.pieces_per_pack)
                setBoxPrice(p.pack_price ?? "")
                setError(null)
                setStep(2)
              }}
              onStartNew={(name, sku) => {
                setIsNew(true)
                setProduct(null)
                setNewName(name)
                setNewSku(sku)
                setSalePrice("")
                setBoxPrice("")
                setError(null)
              }}
              onCancelNew={() => setIsNew(false)}
              setNewName={setNewName}
              setNewSku={setNewSku}
              setNewCategory={setNewCategory}
            />
          )}

          {step === 2 && (
            <div className="space-y-6">
              <ChosenMedicine name={medicineName} isNew={isNew} onChange={() => setStep(1)} />

              <div>
                <h2 className="text-xl font-semibold">How many arrived?</h2>
                <p className="text-muted-foreground">Count the boxes, and how many tablets/pieces are inside each box.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
                  <Counter label="Boxes / packs" value={boxes} onChange={setBoxes} />
                  <span className="hidden pb-3 text-2xl text-muted-foreground sm:block">×</span>
                  <Counter label="Pieces in each box" value={perBox} onChange={setPerBox} />
                  <span className="hidden pb-3 text-2xl text-muted-foreground sm:block">=</span>
                  <div className="rounded-xl bg-accent/60 px-4 py-3 text-center">
                    <p className="text-sm text-accent-foreground">Total to add</p>
                    <p className="text-3xl font-bold text-accent-foreground tabular-nums">{quantity}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  You sell <strong>one piece</strong> at a time. If you only sell whole boxes, keep “pieces in each box” at 1.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold">When does it expire?</h2>
                <p className="text-muted-foreground">
                  Look for “EXP” on the box. If it shows only month and year (like EXP 09/2028), leave Day as “Not on box”.
                </p>
                <div className="mt-4 grid max-w-xl grid-cols-[1fr_1.3fr_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label>Day</Label>
                    <Select value={dayExact && Number(expDay) > monthDays ? String(monthDays) : expDay} onValueChange={setExpDay}>
                      <SelectTrigger className="h-12 w-full text-base" aria-label="Expiry day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={DAY_NOT_ON_BOX}>Not on box</SelectItem>
                        {Array.from({ length: monthDays }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {pad(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Month</Label>
                    <Select value={expMonth} onValueChange={setExpMonth}>
                      <SelectTrigger className="h-12 w-full text-base" aria-label="Expiry month">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={m} value={String(i + 1)}>
                            {String(i + 1).padStart(2, "0")} – {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Year</Label>
                    <Select value={expYear} onValueChange={setExpYear}>
                      <SelectTrigger className="h-12 w-full text-base" aria-label="Expiry year">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => now.getFullYear() + i).map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {expiryDate && !expiryPast && (
                  <p className="mt-3 text-sm">
                    Good until <strong>{expiryLabel.replace(" (end of month)", "")}</strong>
                    {!dayExact && ` (the last day, ${pad(day)})`}.
                  </p>
                )}
              </div>

              {showBatch ? (
                <div className="max-w-md space-y-1.5">
                  <Label htmlFor="batch">Batch number (optional)</Label>
                  <Input id="batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="e.g. PN2401" className="h-12" />
                  <p className="text-sm text-muted-foreground">Printed on the box as “Batch” or “Lot”. Leave empty and we will make one.</p>
                </div>
              ) : (
                <button type="button" onClick={() => setShowBatch(true)} className="text-sm text-primary underline-offset-4 hover:underline">
                  + Add the batch number from the box (optional)
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <ChosenMedicine name={medicineName} isNew={isNew} onChange={() => setStep(1)} />

              <div className="max-w-md space-y-1.5">
                <h2 className="text-xl font-semibold">How much did you pay?</h2>
                <p className="text-muted-foreground">The total for all {quantity} pieces, from the supplier’s bill.</p>
                <MoneyInput id="paid" value={totalPaid} onChange={setTotalPaid} placeholder={isNew ? "e.g. 300" : "Leave empty to use the last price"} />
                {unitCost !== null && (
                  <p className="text-sm">
                    That is <strong>{formatMoney(unitCost)}</strong> for one piece
                    {totalPaid === "" && !isNew && " (same as last time)"}.
                  </p>
                )}
              </div>

              <div className="max-w-md space-y-1.5">
                <h2 className="text-xl font-semibold">Price for the customer</h2>
                <p className="text-muted-foreground">What the customer pays for one piece.</p>
                <MoneyInput id="sale" value={salePrice} onChange={setSalePrice} placeholder="e.g. 8" />
              </div>

              {perBox > 1 && (
                <div className="max-w-md space-y-1.5">
                  <h2 className="text-xl font-semibold">Price of a full box (optional)</h2>
                  <p className="text-muted-foreground">
                    Customers can buy loose pieces or a whole box of {perBox}. Leave empty to charge {perBox} × the piece price
                    {sale !== null && ` (${formatMoney(sale * perBox)})`}.
                  </p>
                  <MoneyInput id="box" value={boxPrice} onChange={setBoxPrice} placeholder={sale !== null ? `e.g. ${Math.floor(sale * perBox)}` : "Optional"} />
                  {boxPriceTooLow && <p className="text-sm text-red-700">This box price is lower than what a box costs you.</p>}
                </div>
              )}

              {profit !== null && sale !== null && (
                <div className={cn("max-w-md rounded-xl px-4 py-3", profit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
                  {profit >= 0 ? (
                    <p>
                      You earn <strong>{formatMoney(profit)}</strong> on each piece
                      {unitCost ? ` (${Math.round((profit / unitCost) * 100)}% profit)` : ""}, about <strong>{formatMoney(profit * quantity)}</strong> on this delivery.
                    </p>
                  ) : (
                    <p>
                      <strong>Careful:</strong> you would lose {formatMoney(-profit)} on each piece.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Is everything correct?</h2>
              <dl className="divide-y rounded-xl border">
                <Summary label="Medicine" value={medicineName} note={isNew ? "New medicine" : undefined} onEdit={() => setStep(1)} />
                {isNew && <Summary label="Type" value={newCategory} onEdit={() => setStep(1)} />}
                <Summary label="Adding" value={`${quantity} pieces (${boxes} × ${perBox})`} onEdit={() => setStep(2)} />
                <Summary label="Expiry" value={expiryLabel} onEdit={() => setStep(2)} />
                <Summary label="You paid" value={unitCost !== null ? `${formatMoney(unitCost * quantity)} (${formatMoney(unitCost)} each)` : "—"} onEdit={() => setStep(3)} />
                <Summary
                  label="Customer pays"
                  value={
                    sale !== null
                      ? `${formatMoney(sale)} a piece${perBox > 1 ? ` · ${formatMoney(boxPrice !== "" ? toNumber(boxPrice) : sale * perBox)} a box of ${perBox}` : ""}`
                      : "—"
                  }
                  onEdit={() => setStep(3)}
                />
              </dl>
              <HelpTip>When you press Save, these {quantity} pieces can be sold right away.</HelpTip>
            </div>
          )}

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-700">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            {step > 1 ? (
              <Button variant="outline" size="lg" onClick={back}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              (step !== 1 || isNew) && (
                <Button size="lg" className="min-w-40" onClick={next}>
                  Next <ArrowRight />
                </Button>
              )
            ) : (
              <Button size="lg" className="min-w-48 text-lg" onClick={save} disabled={receive.isPending}>
                {receive.isPending ? <Spinner className="size-5" /> : <Check />} Save stock
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Step 1: find or create the medicine ----------------

function StepMedicine({
  product,
  isNew,
  newName,
  newSku,
  newCategory,
  onChoose,
  onStartNew,
  onCancelNew,
  setNewName,
  setNewSku,
  setNewCategory,
}: {
  product: Product | null
  isNew: boolean
  newName: string
  newSku: string
  newCategory: string
  onChoose: (p: Product) => void
  onStartNew: (name: string, sku: string) => void
  onCancelNew: () => void
  setNewName: (v: string) => void
  setNewSku: (v: string) => void
  setNewCategory: (v: string) => void
}) {
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounce(query.trim(), 200)
  const products = useProducts({ search: debounced, page_size: 8, ordering: "name" })
  const categories = useCategories()
  const [typingCategory, setTypingCategory] = useState(false)
  const speech = useSpeechRecognition({
    lang: config.speechLang,
    onInterim: setQuery,
    onResult: setQuery,
    onError: (m) => toast.error(m),
  })

  const looksLikeBarcode = /^\d{6,}$/.test(query.trim())

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !query.trim()) return
    e.preventDefault()
    // A scanner types the barcode and presses Enter.
    const exact = await api.products.list({ barcode: query.trim() })
    if (exact.results[0]) onChoose(exact.results[0])
    else if (products.data?.results.length === 1) onChoose(products.data.results[0])
    else onStartNew(looksLikeBarcode ? "" : query.trim(), looksLikeBarcode ? query.trim() : "")
  }

  if (isNew) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">New medicine</h2>
          <Button variant="ghost" onClick={onCancelNew}>
            <ArrowLeft /> Back to the list
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-name">Medicine name</Label>
          <Input id="new-name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="h-12 text-base" placeholder="e.g. Panadol 500mg Tablet" />
          <p className="text-sm text-muted-foreground">Include the strength and form, as written on the box.</p>
        </div>
        <div className="space-y-2">
          <Label>Type of medicine</Label>
          <div className="flex flex-wrap gap-2">
            {(categories.data ?? []).map((c) => (
              <Button
                key={c.id}
                type="button"
                variant={!typingCategory && newCategory === c.name ? "default" : "outline"}
                onClick={() => {
                  setTypingCategory(false)
                  setNewCategory(c.name)
                }}
              >
                {c.name}
              </Button>
            ))}
            <Button
              type="button"
              variant={typingCategory ? "default" : "outline"}
              onClick={() => {
                setTypingCategory(true)
                setNewCategory("")
              }}
            >
              <Plus /> New type
            </Button>
          </div>
          {typingCategory && (
            <Input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="h-12 max-w-md text-base" placeholder="e.g. Pain relief, Antibiotics, Syrups" />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-sku">Barcode (optional)</Label>
          <Input id="new-sku" value={newSku} onChange={(e) => setNewSku(e.target.value)} className="h-12 max-w-md text-base" placeholder="Click here and scan the box" />
          <p className="text-sm text-muted-foreground">No barcode? Leave it empty and we will make a code for you.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Which medicine arrived?</h2>
        <p className="text-muted-foreground">Type its name, scan the barcode, or tap the microphone and say it.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={speech.listening ? "Listening… say the medicine name" : "e.g. Panadol"}
          className={cn("h-14 pr-14 pl-12 text-lg", speech.listening && "ring-3 ring-primary/20")}
          aria-label="Search medicines"
        />
        {speech.supported && (
          <Button
            type="button"
            size="icon"
            variant={speech.listening ? "default" : "ghost"}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            className="absolute top-1/2 right-2 -translate-y-1/2"
            aria-label="Say the medicine name"
          >
            <Mic />
          </Button>
        )}
      </div>

      {products.isLoading ? (
        <LoadingState rows={4} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {products.data?.results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChoose(p)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-accent/50",
                  product?.id === p.id && "bg-accent/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="text-sm text-muted-foreground">
                    In stock now: {p.sellable_stock} · sells for {formatMoney(p.selling_price)}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Choose</span>
              </button>
            </li>
          ))}
          {products.data?.results.length === 0 && (
            <li className="px-4 py-6 text-center text-muted-foreground">
              {debounced ? `“${debounced}” is not in your list yet.` : "You have not added any medicines yet."}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
        <span className="text-muted-foreground">Not in the list? It is a new medicine.</span>
        <Button variant="outline" size="lg" onClick={() => onStartNew(looksLikeBarcode ? "" : query.trim(), looksLikeBarcode ? query.trim() : "")}>
          <Plus /> {query.trim() && !looksLikeBarcode ? `Add “${query.trim()}” as new` : "Add a new medicine"}
        </Button>
      </div>
    </div>
  )
}

// ---------------- Small pieces ----------------

function Stepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map(({ title, icon: Icon }, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={title} className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={cn(
                "flex size-11 items-center justify-center rounded-full border-2 transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-accent text-accent-foreground",
                !done && !current && "border-muted bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-5" /> : <Icon className="size-5" />}
            </span>
            <span className={cn("text-xs sm:text-sm", current ? "font-semibold" : "text-muted-foreground")}>
              {n}. {title}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ChosenMedicine({ name, isNew, onChange }: { name: string; isNew: boolean; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
      <span>
        <span className="block text-sm text-muted-foreground">{isNew ? "New medicine" : "Medicine"}</span>
        <span className="text-lg font-semibold">{name}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={onChange}>
        <Pencil /> Change
      </Button>
    </div>
  )
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon-lg" onClick={() => onChange(Math.max(1, value - 1))} aria-label={`Fewer ${label}`}>
          <Minus />
        </Button>
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
          className="h-12 w-20 text-center text-lg tabular-nums"
        />
        <Button type="button" variant="outline" size="icon-lg" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function MoneyInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-medium text-muted-foreground">Rs</span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="h-12 pl-11 text-lg tabular-nums"
      />
    </div>
  )
}

function Summary({ label, value, note, onEdit }: { label: string; value: string; note?: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-medium">
          {value}
          {note && <span className="ml-2 rounded-md bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">{note}</span>}
        </dd>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil /> Change
      </Button>
    </div>
  )
}

function Done({ result, quantity, onAddAnother }: { result: ReceiveStockResult; quantity: number; onAddAnother: () => void }) {
  const expiry = useMemo(() => {
    const [y, m, d] = result.batch.expiry_date.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
  }, [result.batch.expiry_date])
  return (
    <div className="mx-auto w-full max-w-2xl py-6 text-center">
      <CheckCircle2 className="mx-auto size-16 text-primary" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Stock saved</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        {quantity} × <strong className="text-foreground">{result.product.name}</strong> added (expires {expiry}).
      </p>
      <p className="mt-1 text-muted-foreground">
        You now have <strong className="text-foreground">{result.product.sellable_stock}</strong> in stock.
        {result.created_product && ` Its code is ${result.product.sku}.`}
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Button size="lg" className="h-14" onClick={onAddAnother}>
          <PackagePlus /> Add another delivery
        </Button>
        <Button asChild size="lg" variant="outline" className="h-14">
          <Link href="/pos">
            <ShoppingCart /> Start selling
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-14">
          <Link href="/inventory">
            <Boxes /> See all stock
          </Link>
        </Button>
      </div>
    </div>
  )
}
