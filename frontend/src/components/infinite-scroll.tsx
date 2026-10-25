"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useRef } from "react"

import { Spinner } from "@/components/common"
import { Button } from "@/components/ui/button"

/**
 * Put this under a list. When it scrolls into view (or is about to), the next page loads by itself;
 * a "Show more" button remains as a fallback and for keyboard users.
 */
export function LoadMore({
  shown,
  total,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  noun = "items",
}: {
  shown: number
  total: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  noun?: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    // Start loading a little before the bottom is reached, so scrolling feels continuous.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: "400px 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (total === 0) return null

  return (
    <div ref={sentinel} className="flex flex-col items-center gap-2 py-5 text-sm text-muted-foreground">
      <span>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {hasNextPage ? (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? <Spinner /> : <ChevronDown />} {isFetchingNextPage ? "Loading more…" : "Show more"}
        </Button>
      ) : (
        shown > 0 && <span className="text-xs">That’s everything.</span>
      )}
    </div>
  )
}
