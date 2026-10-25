"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"
import { AuthProvider } from "@/lib/auth"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Don't retry client errors (validation, auth, not found); retry transient ones once.
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </AuthProvider>
      <Toaster theme="light" position="bottom-center" richColors closeButton />
    </QueryClientProvider>
  )
}
