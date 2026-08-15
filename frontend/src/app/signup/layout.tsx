import type { Metadata } from 'next'

// Page metadata only — the signup page itself is a client component.
export const metadata: Metadata = {
  title: 'Sign Up Free',
  description:
    'Create your free Medzae account — join the medical hub for news, events, notebooks, groups, chat, and AI-assisted study.',
  alternates: { canonical: '/signup' },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
