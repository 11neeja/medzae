import type { Metadata } from 'next'

// Page metadata only — the login page itself is a client component.
export const metadata: Metadata = {
  title: 'Log In',
  description:
    'Log in to Medzae — the medical learning and collaboration platform for students, doctors, professors, and researchers.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
