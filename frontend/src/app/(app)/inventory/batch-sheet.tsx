"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Search } from "lucide-react"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Spinner } from "@/components/common"
import { applyServerErrors, decimalString, FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDebounce } from "@/hooks/use-debounce"
import { formatMoney } from "@/lib/format"
import { useProducts, useSaveBatch } from "@/lib/queries"
import type { Batch, Product } from "@/lib/types"
import { cn } from "@/lib/utils"

const schema = z.object({
  product: z.number({ error: "Choose a product" }).int().positive("Choose a product"),
  batch_no: z.string().trim().min(1, "Enter the batch number").max(64),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an expiry date"),
  quantity: z.string().regex(/^\d+$/, "Enter a whole number"),
  purchase_price: z.string().regex(decimalString, "Enter a valid amount, e.g. 4.50"),
})
type Values = z.infer<typeof schema>

const FIELDS = ["product", "batch_no", "expiry_date", "quantity", "purchase_price"] as const

export function BatchSheet({
  open,
  onOpenChange,
  batch,
  product,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  batch?: Batch | null
  /** Pre-select this medicine when adding new stock. */
  product?: Product | null
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl">{batch ? "Edit stock" : "Add stock (new delivery)"}</SheetTitle>
          <SheetDescription>{batch ? "Correct the details, or lower the quantity to remove damaged or expired items." : "Do this every time medicines arrive. Each delivery is saved separately with its own expiry date."}</SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the form starts fresh every time. */}
        <BatchForm batch={batch} product={product} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function BatchForm({ batch, product, onDone }: { batch?: Batch | null; product?: Product | null; onDone: () => void }) {
  const save = useSaveBatch()
  const [search, setSearch] = useState("")
  const [productLabel, setProductLabel] = useState(
    batch ? `${batch.product_name} (${batch.product_sku})` : product ? `${product.name} (${product.sku})` : "",
  )
  const debounced = useDebounce(search.trim(), 200)
  const products = useProducts({ search: debounced, page_size: 6, ordering: "name" }, !batch)

  const { register, handleSubmit, setError, setValue, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: batch
      ? {
          product: batch.product,
          batch_no: batch.batch_no,
          expiry_date: batch.expiry_date,
          quantity: String(batch.quantity),
          purchase_price: batch.purchase_price,
        }
      : product
        ? { product: product.id, batch_no: "", expiry_date: "", quantity: "", purchase_price: product.purchase_price }
        : { batch_no: "", expiry_date: "", quantity: "", purchase_price: "" },
  })
  const { errors } = formState
  const selectedProduct = useWatch({ control, name: "product" })

  const onSubmit = (values: Values) =>
    save.mutate(
      { id: batch?.id, data: { ...values, quantity: Number(values.quantity) } },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (!applyServerErrors(error, setError, FIELDS)) toast.error(error.message)
        },
      },
    )

  return (
    <>
      <form id="batch-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-4" noValidate>
        <FormField id="product-search" label="Which medicine?" error={errors.product?.message}>
          {batch ? (
            <p className="flex h-10 items-center rounded-lg border bg-muted/50 px-3 text-sm">{productLabel}</p>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="product-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={productLabel || "Type the medicine name…"}
                  className="pl-9"
                />
              </div>
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                {products.data?.results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setValue("product", p.id, { shouldValidate: true })
                        setValue("purchase_price", p.purchase_price)
                        setProductLabel(`${p.name} (${p.sku})`)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted",
                        selectedProduct === p.id && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.sku} · cost {formatMoney(p.purchase_price)}
                        </span>
                      </span>
                      {selectedProduct === p.id && <Check className="size-4 shrink-0" />}
                    </button>
                  </li>
                ))}
                {products.data?.results.length === 0 && <li className="p-3 text-sm text-muted-foreground">No matches.</li>}
              </ul>
            </div>
          )}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="batch_no" label="Batch number" hint="Printed on the box (Batch / Lot)" error={errors.batch_no?.message}>
            <Input id="batch_no" aria-invalid={!!errors.batch_no} {...register("batch_no")} />
          </FormField>
          <FormField id="expiry_date" label="Expiry date" hint="Printed on the box (EXP)" error={errors.expiry_date?.message}>
            <Input id="expiry_date" type="date" aria-invalid={!!errors.expiry_date} {...register("expiry_date")} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="quantity" label="How many arrived?" hint="Count in the unit you sell, e.g. tablets" error={errors.quantity?.message}>
            <Input id="quantity" inputMode="numeric" aria-invalid={!!errors.quantity} {...register("quantity")} />
          </FormField>
          <FormField id="purchase_price" label="Cost of one (Rs)" hint="What you paid for one unit" error={errors.purchase_price?.message}>
            <Input id="purchase_price" inputMode="decimal" aria-invalid={!!errors.purchase_price} {...register("purchase_price")} />
          </FormField>
        </div>
      </form>
      <SheetFooter className="flex-row justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="batch-form" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {batch ? "Save changes" : "Save stock"}
        </Button>
      </SheetFooter>
    </>
  )
}
