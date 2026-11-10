import './globals.css'
import type { Viewport } from 'next'

export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#fdf8f3' }

export const metadata = {
  title: 'Wedding Guest Memories',
  description: 'Share your wedding memories with the happy couple',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
