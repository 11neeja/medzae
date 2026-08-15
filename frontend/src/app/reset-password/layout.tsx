import type { Metadata } from 'next'

// Token-carrying utility page — kept out of search indexes.
export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Choose a new password for your Medzae account.',
  robots: { index: false, follow: true },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
