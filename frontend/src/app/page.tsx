"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** "/" just forwards to the dashboard (done in the browser so it also works in the static build). */
export default function Home() {
  const router = useRouter()
  useEffect(() => router.replace("/dashboard"), [router])
  return null
}
