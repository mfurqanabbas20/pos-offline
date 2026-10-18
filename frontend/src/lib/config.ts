export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, ""),
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "USD",
  locale: process.env.NEXT_PUBLIC_LOCALE ?? "en-US",
  /** BCP-47 language for voice search, e.g. "en-US", "en-GB", "ur-PK". */
  speechLang: process.env.NEXT_PUBLIC_SPEECH_LANG ?? "en-US",
  pharmacy: {
    name: process.env.NEXT_PUBLIC_PHARMACY_NAME ?? "CarePlus Pharmacy",
    address: process.env.NEXT_PUBLIC_PHARMACY_ADDRESS ?? "12 Main Street, City Centre",
    phone: process.env.NEXT_PUBLIC_PHARMACY_PHONE ?? "+1 555 0100",
    footer: process.env.NEXT_PUBLIC_RECEIPT_FOOTER ?? "Thank you! Medicines once sold are returnable within 7 days with receipt.",
  },
  expiryWarningDays: 90,
}
