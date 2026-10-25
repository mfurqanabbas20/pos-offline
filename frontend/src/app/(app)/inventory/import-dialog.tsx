"use client"

import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Spinner } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { saveBlob } from "@/lib/download"
import { useInventoryImport } from "@/lib/queries"
import type { ImportResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACCEPT = ".xlsx,.xlsm,.csv"

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Add many medicines from Excel</DialogTitle>
          <DialogDescription>
            Add or update many products and receive their stock in one go. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each import starts fresh. */}
        <ImportFlow onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ImportFlow({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const importer = useInventoryImport()

  const choose = (picked: File | undefined) => {
    if (!picked) return
    setFile(picked)
    setPreview(null)
    setFileError(null)
    importer.mutate(
      { file: picked, commit: false },
      { onSuccess: setPreview, onError: (error) => setFileError(error.message) },
    )
  }

  const confirm = () => {
    if (!file) return
    importer.mutate(
      { file, commit: true },
      {
        onSuccess: ({ summary }) => {
          toast.success("Import complete", {
            description: `${summary.products_to_create} new, ${summary.products_to_update} updated, ${summary.units_to_add} units of stock added.`,
          })
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      saveBlob(await api.inventoryImport.template(), "inventory-import-template.xlsx")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const summary = preview?.summary
  const hasErrors = !!summary && summary.error_rows > 0
  // Problem rows first so they're seen without scrolling.
  const rows = preview ? [...preview.rows].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.row - b.row) : []

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
          <div className="text-sm">
            <p className="font-medium">Step 1: Download the sheet and fill it in</p>
            <p className="text-muted-foreground">One row per medicine. The second page of the sheet explains every column.</p>
          </div>
          <Button variant="outline" onClick={downloadTemplate} disabled={downloading}>
            {downloading ? <Spinner /> : <Download />} Download blank sheet
          </Button>
        </div>

        <div>
          <p className="mb-2 font-medium">Step 2: Choose your filled-in sheet</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              choose(e.dataTransfer.files[0])
            }}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/30",
              dragging && "border-primary bg-accent/50",
            )}
          >
            {file ? <FileSpreadsheet className="size-7 text-primary" /> : <Upload className="size-7 text-muted-foreground" />}
            <span className="font-medium">{file ? file.name : "Click here to choose the file"}</span>
            <span className="text-xs text-muted-foreground">Excel (.xlsx) or CSV, up to 5 MB and 5,000 rows</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              choose(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </div>

        {importer.isPending && !preview && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Checking the file…
          </p>
        )}

        {fileError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {fileError}
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            <p className="font-medium">Step 3: Check, then press Import</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <Stat label="new products" value={summary.products_to_create} />
              <Stat label="updated" value={summary.products_to_update} />
              <Stat label="batches" value={summary.batches_to_create} />
              <Stat label="units of stock" value={summary.units_to_add} />
              {hasErrors && <Stat label={summary.error_rows === 1 ? "row with errors" : "rows with errors"} value={summary.error_rows} danger />}
            </div>

            {hasErrors ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                Fix the rows marked below in your spreadsheet, save it, and upload it again. Nothing has been imported.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="size-4" /> All {summary.rows} rows are ready to import.
              </p>
            )}

            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row} className={cn(r.errors.length > 0 && "bg-destructive/5 hover:bg-destructive/5")}>
                      <TableCell className="text-muted-foreground tabular-nums">{r.row}</TableCell>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium">{r.name || "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.sku || "no SKU"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{r.product_action === "create" ? "New" : "Update"}</Badge>
                          {r.batch_action === "create" && r.quantity > 0 && (
                            <Badge variant="outline" className="border-primary/30 bg-accent text-accent-foreground">
                              +{r.quantity} stock
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {r.errors.length === 0 ? (
                          <span className="text-sm text-emerald-700">OK</span>
                        ) : (
                          <ul className="space-y-0.5 text-sm text-destructive">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={confirm} disabled={!summary || hasErrors || importer.isPending}>
          {importer.isPending && preview && <Spinner />}
          {summary ? `Import ${summary.rows} ${summary.rows === 1 ? "row" : "rows"}` : "Import"}
        </Button>
      </DialogFooter>
    </>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <span className={cn("rounded-lg border px-3 py-1.5", danger ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-card")}>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span> {label}
    </span>
  )
}
