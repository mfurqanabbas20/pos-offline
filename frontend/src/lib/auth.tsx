"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { api, setUnauthorizedHandler, tokens } from "./api"
import type { User } from "./types"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
    setStatus("unauthenticated")
    queryClient.clear()
    router.replace("/login")
  }, [queryClient, router])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setStatus("unauthenticated")
    })
    // Restore the session from stored tokens on first load.
    const restore = async () => {
      if (!tokens.access && !tokens.refresh) throw new Error("No stored session")
      return api.auth.me()
    }
    restore()
      .then((me) => {
        setUser(me)
        setStatus("authenticated")
      })
      .catch(() => {
        tokens.clear()
        setStatus("unauthenticated")
      })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    tokens.set(await api.auth.login(username, password))
    setUser(await api.auth.me())
    setStatus("authenticated")
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>")
  return context
}
