import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'Medical Events',
  description: 'Discover medical conferences, workshops, and seminars on Medzae.',
  robots: { index: false, follow: true },
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children
}
