"use client"

import { LayoutDashboard, LogOut, Package, Receipt, ShoppingCart, Undo2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo, LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { config } from "@/lib/config"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "New Sale", icon: ShoppingCart },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/returns", label: "Returns", icon: Undo2 },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="no-print sticky top-0 flex h-screen w-20 shrink-0 flex-col overflow-y-auto border-r bg-sidebar xl:w-60">
      <Link href="/dashboard" className="flex h-20 shrink-0 items-center justify-center px-4 xl:justify-start xl:px-5" title={config.pharmacy.name}>
        <LogoMark className="size-11 drop-shadow-sm xl:hidden" />
        <Logo className="hidden xl:flex" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex h-12 items-center justify-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:justify-start",
                active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="hidden xl:inline">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <div className="hidden px-2 pb-2 xl:block">
          <p className="truncate text-sm font-medium">{user?.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">@{user?.username}</p>
        </div>
        <Button variant="ghost" className="h-11 w-full justify-center text-muted-foreground xl:justify-start" onClick={logout}>
          <LogOut className="size-5" />
          <span className="hidden xl:inline">Sign out</span>
        </Button>
      </div>
    </aside>
  )
}
