"use client"

import { Home, LogOut, Package, Receipt, ShoppingCart, Undo2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo, LogoMark } from "@/components/logo"
import { useAuth } from "@/lib/auth"
import { config } from "@/lib/config"
import { cn } from "@/lib/utils"

// `short` is shown under the icon on narrower screens, `label` beside it on wide ones.
export const NAV = [
  { href: "/dashboard", label: "Home", short: "Home", icon: Home },
  { href: "/pos", label: "New Sale", short: "Sell", icon: ShoppingCart },
  { href: "/inventory", label: "Medicines & Stock", short: "Stock", icon: Package },
  { href: "/invoices", label: "Sales History", short: "Sales", icon: Receipt },
  { href: "/returns", label: "Returns & Refunds", short: "Returns", icon: Undo2 },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="no-print sticky top-0 flex h-screen w-24 shrink-0 flex-col overflow-y-auto border-r bg-sidebar xl:w-64">
      <Link href="/dashboard" className="flex h-20 shrink-0 items-center justify-center px-4 xl:justify-start xl:px-5" title={config.pharmacy.name}>
        <LogoMark className="size-11 drop-shadow-sm xl:hidden" />
        <Logo className="hidden xl:flex" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1.5 px-2.5 py-4 xl:px-3" aria-label="Main menu">
        {NAV.map(({ href, label, short, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "xl:h-13 xl:flex-row xl:justify-start xl:gap-3 xl:px-3.5 xl:py-0 xl:text-base",
                active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-6 shrink-0 xl:size-5" />
              <span className="xl:hidden">{short}</span>
              <span className="hidden xl:inline">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-2.5 xl:p-3">
        <div className="hidden px-2 pb-2 xl:block">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="truncate font-medium">{user?.full_name}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:h-12 xl:flex-row xl:gap-3 xl:px-3.5 xl:py-0 xl:text-base"
        >
          <LogOut className="size-6 xl:size-5" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
