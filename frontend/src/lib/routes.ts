/**
 * Links to record pages. IDs travel in the query string (not the path) so every page exists as a
 * plain file in the static build that the Windows 7 package serves without Node.js.
 */
export const invoiceHref = (id: number) => `/invoices/view?id=${id}`

export const receiptHref = (id: number, print = false) => `/receipt?id=${id}${print ? "&print=1" : ""}`
