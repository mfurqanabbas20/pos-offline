"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useAuth } from "@/lib/auth"

/** Renders children only for signed-in users; otherwise redirects to /login. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
  }, [status, router])

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label="Loading" />
      </div>
    )
  }
  return <>{children}</>
}
