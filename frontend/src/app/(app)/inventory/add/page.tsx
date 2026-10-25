import { Suspense } from "react"

import { LoadingState } from "@/components/common"

import { AddStockFlow } from "./add-stock"

export default function AddStockPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="mx-auto max-w-3xl" />}>
      <AddStockFlow />
    </Suspense>
  )
}
