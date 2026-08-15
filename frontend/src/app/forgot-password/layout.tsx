import type { Metadata } from 'next'

// Utility page — kept out of search indexes.
export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Request a password reset link for your Medzae account.',
  robots: { index: false, follow: true },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
