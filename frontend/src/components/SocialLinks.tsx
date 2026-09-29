'use client';

import { Instagram } from 'lucide-react';
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  WHATSAPP_COMMUNITY_URL,
} from '@/lib/seo';

// Lucide dropped brand marks; Instagram only survives as a legacy glyph and
// WhatsApp is gone entirely, so this is the official mark. It is filled where
// the lucide icons are stroked, which reads heavier at the same box — hence
// the slightly smaller sizes given to it below.
function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// The two public channels, in the order they should always appear. Adding a
// third is one entry here rather than an edit to three different layouts.
const CHANNELS = [
  {
    key: 'instagram',
    href: INSTAGRAM_URL,
    // Instagram is known by its handle, a WhatsApp group by what it is.
    // `cardLabel` is the short form: the sidebar card is as narrow as 170px
    // once the sidebar is dragged in, where "WhatsApp community" wraps to two
    // lines and leaves the two buttons different heights.
    label: `@${INSTAGRAM_HANDLE}`,
    cardLabel: `@${INSTAGRAM_HANDLE}`,
    footerLabel: `Follow @${INSTAGRAM_HANDLE}`,
    ariaLabel: `Follow Medzae on Instagram, @${INSTAGRAM_HANDLE}`,
    Icon: ({ className = '' }: { className?: string }) => (
      <Instagram className={className} strokeWidth={1.75} />
    ),
    iconSize: 'w-4 h-4',
  },
  {
    key: 'whatsapp',
    href: WHATSAPP_COMMUNITY_URL,
    label: 'WhatsApp community',
    cardLabel: 'WhatsApp',
    footerLabel: 'WhatsApp community',
    ariaLabel: 'Join the Medzae WhatsApp community',
    Icon: WhatsAppIcon,
    iconSize: 'w-[15px] h-[15px]',
  },
] as const;

// Every channel link leaves the site, so they all carry the same pair that
// keeps `window.opener` out of the new tab.
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

// The same two links appear in places that look nothing alike: light pills
// beside the contact address, chips on the navy footer, and a card in the
// signed-in sidebar.
type Variant = 'pill' | 'footer' | 'card';

export default function SocialLinks({
  variant = 'pill',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === 'footer') {
    return (
      <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
        {CHANNELS.map(({ key, href, footerLabel, ariaLabel, Icon, iconSize }) => (
          <a
            key={key}
            href={href}
            {...EXTERNAL}
            aria-label={ariaLabel}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/15 bg-white/5 text-sm text-white/75 hover:bg-white/10 hover:text-white hover:border-white/30 transition-colors"
          >
            <Icon className={`${iconSize} shrink-0`} />
            <span className="font-medium">{footerLabel}</span>
          </a>
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`card p-7 ${className}`}>
        <p className="label !mb-1">Follow along</p>
        <h2 className="heading-3 mb-3">Come say hello</h2>
        <p className="body-md mb-5">
          New features and medical highlights on Instagram, and day-to-day conversation in the
          WhatsApp community.
        </p>
        <div className="space-y-2.5">
          {CHANNELS.map(({ key, href, cardLabel, ariaLabel, Icon, iconSize }) => (
            <a
              key={key}
              href={href}
              {...EXTERNAL}
              aria-label={ariaLabel}
              className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
              <Icon className={`${iconSize} shrink-0`} />
              <span className="truncate">{cardLabel}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {CHANNELS.map(({ key, href, label, ariaLabel, Icon, iconSize }) => (
        <a
          key={key}
          href={href}
          {...EXTERNAL}
          aria-label={ariaLabel}
          className={`inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-border-mid)] max-w-full transition-smooth hover:bg-[var(--color-accent-hover)] ${className}`}
        >
          <span className="w-9 h-9 rounded-full bg-[var(--color-blue-primary)] flex items-center justify-center flex-shrink-0">
            <Icon className={`${iconSize} text-white`} />
          </span>
          <span className="font-semibold text-[var(--color-navy)] truncate">{label}</span>
        </a>
      ))}
    </>
  );
}
