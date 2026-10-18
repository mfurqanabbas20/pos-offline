import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { Providers } from "./providers"

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Pharmacy POS", template: "%s · Pharmacy POS" },
  description: "Point of sale and inventory for a single pharmacy.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
