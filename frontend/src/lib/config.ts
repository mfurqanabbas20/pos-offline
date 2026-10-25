export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "https://h7t9b6j5-8000.inc1.devtunnels.ms/api").replace(/\/$/, ""),
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "PKR",
  locale: process.env.NEXT_PUBLIC_LOCALE ?? "en-PK",
  /** BCP-47 language for voice search, e.g. "en-US", "en-GB", "ur-PK". */
  speechLang: process.env.NEXT_PUBLIC_SPEECH_LANG ?? "en-US",
  pharmacy: {
    name: process.env.NEXT_PUBLIC_PHARMACY_NAME || "Tasneem Pharmacy",
    address: process.env.NEXT_PUBLIC_PHARMACY_ADDRESS ?? "",
    phone: process.env.NEXT_PUBLIC_PHARMACY_PHONE || "0333-8405395",
    footer: process.env.NEXT_PUBLIC_RECEIPT_FOOTER ?? "Thank you for your purchase!",
  },
  expiryWarningDays: 90,
}
