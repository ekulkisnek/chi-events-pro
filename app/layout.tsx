import './globals.css'
import 'leaflet/dist/leaflet.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Chicago Events Aggregator',
  description: 'Unified Chicago events scraped daily from many sources',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
