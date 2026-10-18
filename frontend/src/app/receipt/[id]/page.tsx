import { Suspense } from "react"

import { AuthGuard } from "@/components/auth-guard"
import { LoadingState } from "@/components/common"

import { ReceiptView } from "./receipt-view"

export default function ReceiptPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<LoadingState rows={6} className="mx-auto mt-10 max-w-sm" />}>
        <ReceiptView />
      </Suspense>
    </AuthGuard>
  )
}
