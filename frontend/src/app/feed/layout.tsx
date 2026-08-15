import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'News Feed',
  description: 'Curated medical news and community posts on Medzae.',
  robots: { index: false, follow: true },
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children
}
