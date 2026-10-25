"use client"

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "./api"
import type { BatchInput, Paginated, ProductInput, QueryParams, ReceiveStockInput, ReturnInput, SaleInput } from "./types"

export const queryKeys = {
  dashboard: (month: string) => ["dashboard", month] as const,
  inventory: (days?: number) => ["inventory", days] as const,
  categories: ["categories"] as const,
  products: (params: QueryParams) => ["products", params] as const,
  batches: (params: QueryParams) => ["batches", params] as const,
  invoices: (params: QueryParams) => ["invoices", params] as const,
  invoice: (id: number) => ["invoice", id] as const,
  returns: (params: QueryParams) => ["returns", params] as const,
}

// ---------- Queries ----------

export const useDashboard = (month: string) =>
  useQuery({ queryKey: queryKeys.dashboard(month), queryFn: () => api.dashboard(month), placeholderData: keepPreviousData })

export const useInventoryReport = (limit = 20, days?: number) =>
  useQuery({ queryKey: [...queryKeys.inventory(days), limit], queryFn: () => api.inventory({ days, limit }) })

/** Every category (for pickers): follows the pages until there are no more. */
export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      const all = []
      for (let page = 1; ; page++) {
        const res = await api.categories.list({ page, page_size: 200, ordering: "name" })
        all.push(...res.results)
        if (!res.next) return all
      }
    },
    staleTime: 5 * 60_000,
  })

// ---------- Infinite lists ----------

export const INFINITE_PAGE_SIZE = 30

/**
 * Infinite scrolling over a paginated endpoint. The key starts with the resource name ("products",
 * "invoices"...) so the same invalidations that refresh normal lists also refresh these.
 * Returns the loaded rows flattened, the total count and TanStack's fetchNextPage/hasNextPage.
 */
function useInfiniteList<T>(
  resource: string,
  fetchPage: (params: QueryParams) => Promise<Paginated<T>>,
  params: QueryParams,
  { enabled = true, pageSize = INFINITE_PAGE_SIZE }: { enabled?: boolean; pageSize?: number } = {},
) {
  const query = useInfiniteQuery({
    queryKey: [resource, "infinite", params, pageSize],
    queryFn: ({ pageParam }) => fetchPage({ ...params, page: pageParam, page_size: pageSize }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.next ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled,
  })
  const items = query.data?.pages.flatMap((p) => p.results) ?? []
  const count = query.data?.pages[0]?.count ?? 0
  return { ...query, items, count }
}

export type InfiniteList<T> = ReturnType<typeof useInfiniteList<T>>

export const useInfiniteProducts = (params: QueryParams, options?: { enabled?: boolean; pageSize?: number }) =>
  useInfiniteList("products", api.products.list, params, options)

export const useInfiniteBatches = (params: QueryParams) => useInfiniteList("batches", api.batches.list, params)

export const useInfiniteInvoices = (params: QueryParams, options?: { enabled?: boolean; pageSize?: number }) =>
  useInfiniteList("invoices", api.invoices.list, params, options)

export const useInfiniteReturns = (params: QueryParams) => useInfiniteList("returns", api.returns.list, params)

export const useProducts = (params: QueryParams, enabled = true) =>
  useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => api.products.list(params),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useBatches = (params: QueryParams) =>
  useQuery({ queryKey: queryKeys.batches(params), queryFn: () => api.batches.list(params), placeholderData: keepPreviousData })

export const useInvoices = (params: QueryParams, enabled = true) =>
  useQuery({
    queryKey: queryKeys.invoices(params),
    queryFn: () => api.invoices.list(params),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useInvoice = (id: number | null) =>
  useQuery({ queryKey: queryKeys.invoice(id ?? 0), queryFn: () => api.invoices.get(id!), enabled: !!id })

export const useReturns = (params: QueryParams) =>
  useQuery({ queryKey: queryKeys.returns(params), queryFn: () => api.returns.list(params), placeholderData: keepPreviousData })

// ---------- Mutations ----------

/** Anything that moves stock or money invalidates every view derived from it. */
function useInvalidateStock() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ["products", "batches", "inventory", "dashboard", "invoices", "invoice", "returns", "categories"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )
}

export function useSaveProduct() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: ProductInput }) =>
      id ? api.products.update(id, data) : api.products.create(data),
    onSuccess: (product, { id }) => {
      toast.success(id ? `Saved changes to ${product.name}` : `${product.name} saved. Now enter how many arrived.`)
      return invalidate()
    },
  })
}

export function useSaveBatch() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: BatchInput }) =>
      id ? api.batches.update(id, data) : api.batches.create(data),
    onSuccess: (batch, { id }) => {
      toast.success(id ? `Stock updated for ${batch.product_name}` : `Added ${batch.quantity} ${batch.product_name} to stock`)
      return invalidate()
    },
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.categories.create({ name }),
    onSuccess: (category) => {
      toast.success(`New type “${category.name}” added`)
      return queryClient.invalidateQueries({ queryKey: queryKeys.categories })
    },
  })
}

/** Guided "Add stock": creates the medicine if needed and adds the delivery in one request. */
export function useReceiveStock() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (data: ReceiveStockInput) => api.receiveStock(data), onSuccess: () => invalidate() })
}

/** Preview (commit=false) or import (commit=true) an inventory spreadsheet. */
export function useInventoryImport() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: ({ file, commit }: { file: File; commit: boolean }) => api.inventoryImport.upload(file, commit),
    onSuccess: (result) => (result.committed ? invalidate() : undefined),
  })
}

export function useCreateSale() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (data: SaleInput) => api.sales.create(data), onSuccess: () => invalidate() })
}

export function useCreateReturn() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (data: ReturnInput) => api.returns.create(data), onSuccess: () => invalidate() })
}
