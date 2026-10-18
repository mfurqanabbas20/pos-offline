import { Suspense } from "react"

import { LoadingState } from "@/components/common"

import { NewReturnFlow } from "./new-return"

export default function NewReturnPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="mx-auto max-w-4xl" />}>
      <NewReturnFlow />
    </Suspense>
  )
}
