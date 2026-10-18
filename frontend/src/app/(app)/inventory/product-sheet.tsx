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
  })
  .refine((v) => Number(v.selling_price) >= Number(v.purchase_price), {
    path: ["selling_price"],
    message: "Selling price can’t be below purchase price",
  })
type Values = z.infer<typeof schema>

const empty: Values = { name: "", sku: "", category: "", purchase_price: "", selling_price: "", reorder_level: "10", is_active: true }

export function ProductSheet({
  open,
  onOpenChange,
  product,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product ? "Edit product" : "Add product"}</SheetTitle>
          <SheetDescription>Catalog details. Stock is managed through batches.</SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the form starts fresh every time. */}
        <ProductForm product={product} onDone={() => onOpenChange(false)} />
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
  }
}

function ProductForm({ product, onDone }: { product?: Product | null; onDone: () => void }) {
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
        },
      },
      {
        onSuccess: onDone,
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
          <FormField id="name" label="Name" error={errors.name?.message}>
            <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField id="sku" label="SKU / barcode" error={errors.sku?.message}>
            <Input id="sku" aria-invalid={!!errors.sku} {...register("sku")} />
          </FormField>
          <FormField id="category" label="Category" error={errors.category?.message}>
            {newCategory === null ? (
              <div className="flex gap-2">
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category" className="w-full" aria-invalid={!!errors.category}>
                        <SelectValue placeholder="Choose…" />
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
                <Button type="button" variant="outline" size="icon" onClick={() => setNewCategory("")} aria-label="New category">
                  <Plus />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="New category name"
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
            <FormField id="purchase_price" label="Purchase price" error={errors.purchase_price?.message}>
              <Input id="purchase_price" inputMode="decimal" aria-invalid={!!errors.purchase_price} {...register("purchase_price")} />
            </FormField>
            <FormField id="selling_price" label="Selling price" error={errors.selling_price?.message}>
              <Input id="selling_price" inputMode="decimal" aria-invalid={!!errors.selling_price} {...register("selling_price")} />
            </FormField>
          </div>
          <FormField id="reorder_level" label="Reorder level" error={errors.reorder_level?.message} hint="Flag as low stock at or below this quantity.">
            <Input id="reorder_level" inputMode="numeric" aria-invalid={!!errors.reorder_level} {...register("reorder_level")} />
          </FormField>
          <label className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border px-3">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" {...register("is_active")} />
            <span className="text-sm">
              <span className="font-medium">Active</span>
              <span className="text-muted-foreground"> — inactive products can’t be sold</span>
            </span>
          </label>
        </form>
        <SheetFooter className="flex-row justify-end">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {product ? "Save changes" : "Add product"}
          </Button>
        </SheetFooter>
    </>
  )
}
