import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"

export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export const decimalString = /^\d+(\.\d{1,2})?$/

/**
 * Copy backend field errors onto the form. Returns true if at least one field matched,
 * so the caller only needs a toast for non-field errors.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]) {
  if (!(error instanceof ApiError)) return false
  let matched = false
  for (const field of fields) {
    const message = error.fieldError(field)
    if (message) {
      setError(field as Path<T>, { type: "server", message })
      matched = true
    }
  }
  return matched
}
