import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'Chat',
  description: 'Real-time messaging with your medical peers on Medzae.',
  robots: { index: false, follow: true },
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children
}
