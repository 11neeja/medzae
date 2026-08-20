'use client';

import Link from 'next/link';
import { ZAE } from '@/lib/zae';
import { cn } from '@/lib/utils';

interface ZaeAvatarProps {
  size?: number;
  /** The green presence dot the chat shows on her replies. */
  showPresence?: boolean;
  /** Wrap her in a link through to her profile. On by default — she is the
   *  one avatar in the app that always has somewhere to go. */
  linkToProfile?: boolean;
  className?: string;
}

export default function ZaeAvatar({
  size = 36,
  showPresence = false,
  linkToProfile = true,
  className,
}: ZaeAvatarProps) {
  const avatar = (
    <span
      className={cn('relative inline-block shrink-0 align-middle', className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the project
          serves static art directly; next/image is not used anywhere here. */}
      <img
        src={ZAE.avatar}
        alt={`${ZAE.name}, ${ZAE.role}`}
        width={size}
        height={size}
        className="w-full h-full rounded-full object-cover ring-1 ring-[var(--color-border-hairline)]"
      />
      {showPresence && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-emerald-500 border-2 border-white"
          // The dot scales with the tile, or it swamps a 28px avatar.
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
        />
      )}
    </span>
  );

  if (!linkToProfile) return avatar;

  return (
    <Link
      href={ZAE.profileHref}
      aria-label={`View ${ZAE.name}'s profile`}
      title={`${ZAE.name} — ${ZAE.role}`}
      className="shrink-0 rounded-full transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-primary)] focus-visible:ring-offset-2"
      onClick={(e) => e.stopPropagation()}
    >
      {avatar}
    </Link>
  );
}
