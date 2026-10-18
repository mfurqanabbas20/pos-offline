import { Suspense } from "react"

import { LoadingState } from "@/components/common"

import { InvoiceDetailView } from "./invoice-detail"

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="mx-auto max-w-5xl" />}>
      <InvoiceDetailView />
    </Suspense>
  )
}
