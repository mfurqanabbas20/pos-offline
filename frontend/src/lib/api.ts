import { config } from "./config"
import type {
  Batch,
  BatchInput,
  Category,
  Dashboard,
  ImportResult,
  InventoryReport,
  Invoice,
  InvoiceDetail,
  Paginated,
  Product,
  ProductInput,
  QueryParams,
  ReceiveStockInput,
  ReceiveStockResult,
  ReturnInput,
  SaleInput,
  SalesReturn,
  TokenPair,
  User,
} from "./types"

/** Error thrown for any non-2xx response, carrying the backend's error envelope. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = "error",
    public details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = "ApiError"
  }

  /** First message for a field, for wiring server validation errors into forms. */
  fieldError(field: string): string | undefined {
    const value = this.details[field]
    if (Array.isArray(value)) return value.map(String).join(" ")
    return typeof value === "string" ? value : undefined
  }
}

// ---------- Token storage ----------

const ACCESS_KEY = "pos.access"
const REFRESH_KEY = "pos.refresh"

export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY)
  },
  set(pair: Partial<TokenPair>) {
    if (pair.access) localStorage.setItem(ACCESS_KEY, pair.access)
    if (pair.refresh) localStorage.setItem(REFRESH_KEY, pair.refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

// ---------- Core request ----------

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  params?: QueryParams
  auth?: boolean
  /** Multipart body (file uploads); sent as-is so the browser sets the boundary. */
  form?: FormData
  /** Return the response body as a Blob (file downloads) instead of JSON. */
  blob?: boolean
}

function buildUrl(path: string, params?: QueryParams) {
  // apiUrl may be absolute (dev: http://localhost:8000/api) or relative ("/api" when the backend also
  // serves the app, as in the Windows 7 package).
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin
  const url = new URL(`${config.apiUrl}${path}`, base)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function parseError(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    /* non-JSON error page */
  }
  const envelope = (body as { error?: { message?: string; code?: string; details?: Record<string, unknown> } })?.error
  if (envelope) {
    return new ApiError(envelope.message ?? "Request failed.", response.status, envelope.code, envelope.details ?? {})
  }
  return new ApiError(`Request failed (${response.status}).`, response.status)
}

// Share one in-flight refresh between concurrent 401s.
let refreshing: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refresh
  if (!refresh) return false
  refreshing ??= fetch(buildUrl("/auth/refresh/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (response) => {
      if (!response.ok) return false
      tokens.set((await response.json()) as Partial<TokenPair>)
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { method = "GET", body, params, auth = true, form, blob } = options
  const headers: Record<string, string> = { Accept: blob ? "*/*" : "application/json" }
  if (body !== undefined && !form) headers["Content-Type"] = "application/json"
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0, "network_error")
  }

  if (response.status === 401 && auth) {
    if (retry && (await refreshAccessToken())) return request<T>(path, options, false)
    tokens.clear()
    onUnauthorized()
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  if (blob) return (await response.blob()) as T
  return (await response.json()) as T
}

// ---------- Typed endpoints ----------

function crud<T, Input>(base: string) {
  return {
    list: (params?: QueryParams) => request<Paginated<T>>(`${base}/`, { params }),
    get: (id: number) => request<T>(`${base}/${id}/`),
    create: (data: Input) => request<T>(`${base}/`, { method: "POST", body: data }),
    update: (id: number, data: Partial<Input>) => request<T>(`${base}/${id}/`, { method: "PATCH", body: data }),
    remove: (id: number) => request<void>(`${base}/${id}/`, { method: "DELETE" }),
  }
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<TokenPair>("/auth/login/", { method: "POST", body: { username, password }, auth: false }),
    me: () => request<User>("/auth/me/"),
  },
  categories: crud<Category, { name: string }>("/categories"),
  products: crud<Product, ProductInput>("/products"),
  batches: crud<Batch, BatchInput>("/batches"),
  inventory: (params?: { days?: number; limit?: number }) => request<InventoryReport>("/inventory/", { params }),
  receiveStock: (data: ReceiveStockInput) =>
    request<ReceiveStockResult>("/inventory/receive/", { method: "POST", body: data }),
  inventoryImport: {
    upload: (file: File, commit: boolean) => {
      const form = new FormData()
      form.append("file", file)
      form.append("commit", String(commit))
      return request<ImportResult>("/inventory/import/", { method: "POST", form })
    },
    template: () => request<Blob>("/inventory/import/template/", { blob: true }),
  },
  sales: {
    create: (data: SaleInput) => request<InvoiceDetail>("/sales/", { method: "POST", body: data }),
  },
  invoices: {
    list: (params?: QueryParams) => request<Paginated<Invoice>>("/invoices/", { params }),
    get: (id: number) => request<InvoiceDetail>(`/invoices/${id}/`),
  },
  returns: {
    list: (params?: QueryParams) => request<Paginated<SalesReturn>>("/returns/", { params }),
    get: (id: number) => request<SalesReturn>(`/returns/${id}/`),
    create: (data: ReturnInput) => request<SalesReturn>("/returns/", { method: "POST", body: data }),
  },
  dashboard: (month?: string) => request<Dashboard>("/dashboard/", { params: { month } }),
  reports: {
    monthly: (month: string) => request<Blob>("/reports/monthly/", { params: { month }, blob: true }),
  },
}
