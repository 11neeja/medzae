import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'Home',
  description: 'Your Medzae dashboard — news, events, notes, and communities at a glance.',
  robots: { index: false, follow: true },
}

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
