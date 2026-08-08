import type { Metadata, Viewport } from 'next'
import { Fraunces, Manrope, Inter } from 'next/font/google'
import './globals.css'
import {
  SITE_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_GRAPH,
  jsonLd,
} from '@/lib/seo'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OpportunityProvider } from '@/context/OpportunityContext'
import Navbar from '@/components/Navbar'
import ProtectedRoute from '@/components/ProtectedRoute'

// All three are variable fonts. Listing explicit weights made next/font emit a
// @font-face per weight that all pointed at the same variable file with no
// variation settings, so every one rendered at the file's default instance —
// font-weight (and therefore bold) did nothing anywhere in the app. Omitting
// `weight` ships the weight axis itself, which is what a variable font is for.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  style: ['normal', 'italic'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

// Keep Inter loaded for backward compatibility with any
// landing / auth pages still referencing --font-inter.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  category: 'health',
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Root canonical covers the landing page; every other route overrides it
  // (or opts out of indexing) in its own segment layout.
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  // Search-console verification tags. The Google token is public by design
  // (it ships in the served HTML), so the live value is baked in as the
  // default; env vars can override or extend it (see docs/SEO.md).
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      '2ujO5Tqw1xbRZZM--5YipXrF2LaxbqsANEmC9oQny4E',
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
      : {}),
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000B33',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable} ${inter.variable}`}>
      <body className={`${manrope.className} antialiased`}>
        {/* Site-wide structured data: Organization, WebSite (with alternate
            brand names), and WebApplication — read by Google rich results
            and by AI search crawlers. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(SITE_GRAPH) }}
        />
        <AuthProvider>
          <NotificationProvider>
            <AppProvider>
              <OpportunityProvider>
                <Navbar />
                <ProtectedRoute>
                  <main>{children}</main>
                </ProtectedRoute>
              </OpportunityProvider>
            </AppProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
