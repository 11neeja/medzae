import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'AI Study Assistant',
  description: 'Ask medical questions and summarize documents with the Medzae AI assistant.',
  robots: { index: false, follow: true },
}

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return children
}
