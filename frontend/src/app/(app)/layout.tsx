import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AuthGuard } from "@/components/auth-guard"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Suspense>
          <AppSidebar />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </AuthGuard>
  )
}
