import type { Metadata } from 'next'
import { ZAE } from '@/lib/zae'

// Unlike the assistant itself, Zae's profile needs no session and no API call,
// so it is a genuinely public page and safe to index.
export const metadata: Metadata = {
  title: `${ZAE.name} — ${ZAE.role}`,
  description:
    "Meet Zae, Medzae's AI assistant for medical students and healthcare professionals: medical questions answered directly, uploaded documents read properly, and answers saved straight to your notebook.",
  alternates: { canonical: '/zae' },
  openGraph: {
    title: `${ZAE.name} — ${ZAE.role}`,
    description:
      "Medzae's AI assistant for medical study: direct answers across medicine and the health sciences, and documents read from their actual contents.",
    url: '/zae',
    type: 'profile',
  },
}

export default function ZaeLayout({ children }: { children: React.ReactNode }) {
  return children
}
