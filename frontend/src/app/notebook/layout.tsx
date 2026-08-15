import type { Metadata } from 'next'

// Auth-gated app page — titled for the browser tab, noindexed because
// crawlers only ever see the session splash / login redirect.
export const metadata: Metadata = {
  title: 'Notebook',
  description: 'Organize medical notes, PDFs, tasks, and references by subject on Medzae.',
  robots: { index: false, follow: true },
}

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return children
}
