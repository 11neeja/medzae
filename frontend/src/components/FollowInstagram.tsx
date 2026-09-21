'use client';

import { Instagram } from 'lucide-react';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/seo';

// Instagram is the one social account Medzae publishes, and it appears in
// several places that look nothing alike: a light pill beside the contact
// address, a chip on the navy footer, and a card in the signed-in sidebar.
// Keeping them here means the handle, the URL, and the rel/target attributes
// that make an external link safe are written once rather than three times.
type Variant = 'pill' | 'footer' | 'card';

const LINK_PROPS = {
  href: INSTAGRAM_URL,
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

export default function FollowInstagram({
  variant = 'pill',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === 'footer') {
    return (
      <a
        {...LINK_PROPS}
        aria-label={`Follow Medzae on Instagram, @${INSTAGRAM_HANDLE}`}
        className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/15 bg-white/5 text-sm text-white/75 hover:bg-white/10 hover:text-white hover:border-white/30 transition-colors ${className}`}
      >
        <Instagram className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="font-medium">Follow @{INSTAGRAM_HANDLE}</span>
      </a>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`card p-7 ${className}`}>
        <p className="label !mb-1">Follow along</p>
        <h2 className="heading-3 mb-3">We&rsquo;re on Instagram</h2>
        <p className="body-md mb-5">
          New features, medical highlights, and everything happening at Medzae &mdash; in your feed.
        </p>
        <a
          {...LINK_PROPS}
          className="btn-secondary w-full inline-flex items-center justify-center gap-2"
        >
          <Instagram className="w-4 h-4" strokeWidth={1.75} />@{INSTAGRAM_HANDLE}
        </a>
      </div>
    );
  }

  return (
    <a
      {...LINK_PROPS}
      aria-label={`Follow Medzae on Instagram, @${INSTAGRAM_HANDLE}`}
      className={`inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-border-mid)] max-w-full transition-smooth hover:bg-[var(--color-accent-hover)] ${className}`}
    >
      <span className="w-9 h-9 rounded-full bg-[var(--color-blue-primary)] flex items-center justify-center flex-shrink-0">
        <Instagram className="w-4 h-4 text-white" strokeWidth={1.75} />
      </span>
      <span className="font-semibold text-[var(--color-navy)] truncate">@{INSTAGRAM_HANDLE}</span>
    </a>
  );
}
