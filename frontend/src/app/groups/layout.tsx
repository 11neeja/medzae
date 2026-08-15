import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'Groups',
  description: 'Join medical communities and discussion groups on Medzae.',
  robots: { index: false, follow: true },
}

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return children
}
