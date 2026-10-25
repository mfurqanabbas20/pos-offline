"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Spinner } from "@/components/common"
import { applyServerErrors, decimalString, FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCategories, useCreateCategory, useSaveProduct } from "@/lib/queries"
import type { Product } from "@/lib/types"

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter a product name"),
    sku: z.string().trim().min(1, "Enter a SKU or barcode").max(64),
    category: z.string().min(1, "Choose a category"),
    purchase_price: z.string().regex(decimalString, "Enter a valid amount, e.g. 4.50"),
    selling_price: z.string().regex(decimalString, "Enter a valid amount, e.g. 6.99"),
    reorder_level: z.string().regex(/^\d+$/, "Enter a whole number"),
    is_active: z.boolean(),
    pieces_per_pack: z.string().regex(/^[1-9]\d*$/, "Enter a whole number, 1 or more"),
    pack_price: z.string().refine((v) => v === "" || decimalString.test(v), "Enter a valid amount, or leave it empty"),
  })
  .refine((v) => Number(v.selling_price) >= Number(v.purchase_price), {
    path: ["selling_price"],
    message: "Selling price can’t be below purchase price",
  })
  .refine((v) => v.pack_price === "" || Number(v.pack_price) >= Number(v.purchase_price) * Number(v.pieces_per_pack), {
    path: ["pack_price"],
    message: "The box price is lower than what the box costs you",
  })
type Values = z.infer<typeof schema>

const empty: Values = {
  name: "",
  sku: "",
  category: "",
  purchase_price: "",
  selling_price: "",
  reorder_level: "10",
  is_active: true,
  pieces_per_pack: "1",
  pack_price: "",
}

export function ProductSheet({
  open,
  onOpenChange,
  product,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  /** Called with a newly created medicine, so the page can go straight to adding its stock. */
  onCreated?: (product: Product) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl">{product ? "Edit medicine" : "Add a new medicine"}</SheetTitle>
          <SheetDescription>{product ? "Change the details and press Save." : "Copy the details from the box. You will enter how many you have in the next step."}</SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the form starts fresh every time. */}
        <ProductForm product={product} onDone={() => onOpenChange(false)} onCreated={onCreated} />
      </SheetContent>
    </Sheet>
  )
}

function toValues(product?: Product | null): Values {
  if (!product) return empty
  return {
    name: product.name,
    sku: product.sku,
    category: String(product.category),
    purchase_price: product.purchase_price,
    selling_price: product.selling_price,
    reorder_level: String(product.reorder_level),
    is_active: product.is_active,
    pieces_per_pack: String(product.pieces_per_pack),
    pack_price: product.pack_price ?? "",
  }
}

function ProductForm({
  product,
  onDone,
  onCreated,
}: {
  product?: Product | null
  onDone: () => void
  onCreated?: (product: Product) => void
}) {
  const categories = useCategories()
  const save = useSaveProduct()
  const createCategory = useCreateCategory()
  const [newCategory, setNewCategory] = useState<string | null>(null)

  const { register, handleSubmit, setError, setValue, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(product),
  })
  const { errors } = formState

  const onSubmit = (values: Values) =>
    save.mutate(
      {
        id: product?.id,
        data: {
          ...values,
          category: Number(values.category),
          reorder_level: Number(values.reorder_level),
          pieces_per_pack: Number(values.pieces_per_pack),
          // Box price only applies when a box holds more than one piece.
          pack_price: Number(values.pieces_per_pack) > 1 && values.pack_price !== "" ? values.pack_price : null,
        },
      },
      {
        onSuccess: (saved) => {
          onDone()
          if (!product) onCreated?.(saved)
        },
        onError: (error) => {
          if (!applyServerErrors(error, setError, Object.keys(empty))) toast.error(error.message)
        },
      },
    )

  const addCategory = () => {
    const name = newCategory?.trim()
    if (!name) return
    createCategory.mutate(name, {
      onSuccess: (category) => {
        setValue("category", String(category.id), { shouldValidate: true })
        setNewCategory(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
        <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-4" noValidate>
          <FormField id="name" label="Medicine name" hint="Include the strength and form, e.g. Panadol 500mg Tablet" error={errors.name?.message}>
            <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField id="sku" label="Barcode or code" hint="Click here and scan the box. No barcode? Type a short code like PANADOL-500." error={errors.sku?.message}>
            <Input id="sku" aria-invalid={!!errors.sku} {...register("sku")} />
          </FormField>
          <FormField id="category" label="Type of medicine" hint="Groups similar medicines. Press + to make a new type." error={errors.category?.message}>
            {newCategory === null ? (
              <div className="flex gap-2">
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category" className="w-full" aria-invalid={!!errors.category}>
                        <SelectValue placeholder="Choose a type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.data?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setNewCategory("")} aria-label="Make a new type">
                  <Plus />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="e.g. Pain relief"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addCategory()
                    }
                  }}
                />
                <Button type="button" onClick={addCategory} disabled={createCategory.isPending}>
                  Add
                </Button>
                <Button type="button" variant="ghost" onClick={() => setNewCategory(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="purchase_price" label="Cost price (Rs)" hint="What you pay, for one unit you sell" error={errors.purchase_price?.message}>
              <Input id="purchase_price" inputMode="decimal" aria-invalid={!!errors.purchase_price} {...register("purchase_price")} />
            </FormField>
            <FormField id="selling_price" label="Sale price (Rs)" hint="What the customer pays for one piece" error={errors.selling_price?.message}>
              <Input id="selling_price" inputMode="decimal" aria-invalid={!!errors.selling_price} {...register("selling_price")} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="pieces_per_pack"
              label="Pieces in one box"
              hint="e.g. 10 tablets. Use 1 if you only sell it whole."
              error={errors.pieces_per_pack?.message}
            >
              <Input id="pieces_per_pack" inputMode="numeric" aria-invalid={!!errors.pieces_per_pack} {...register("pieces_per_pack")} />
            </FormField>
            <FormField id="pack_price" label="Box price (Rs)" hint="Optional. Empty = pieces × sale price." error={errors.pack_price?.message}>
              <Input id="pack_price" inputMode="decimal" placeholder="Optional" aria-invalid={!!errors.pack_price} {...register("pack_price")} />
            </FormField>
          </div>
          <FormField id="reorder_level" label="Warn me when stock falls to" error={errors.reorder_level?.message} hint="You will see a “Running low” warning at this number.">
            <Input id="reorder_level" inputMode="numeric" aria-invalid={!!errors.reorder_level} {...register("reorder_level")} />
          </FormField>
          <label className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border px-3">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" {...register("is_active")} />
            <span className="text-sm">
              <span className="font-medium">Available for sale</span>
              <span className="text-muted-foreground"> — untick to hide it from the sale screen</span>
            </span>
          </label>
        </form>
        <SheetFooter className="flex-row justify-end">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {product ? "Save changes" : "Save and add stock"}
          </Button>
        </SheetFooter>
    </>
  )
}
