'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen splash shown ONLY while restoring a previously stored session
 * (a token exists locally and is being validated against the backend).
 * Anonymous visitors never see it — public pages paint immediately.
 *
 * The hint line fades in after a few seconds to set expectations when the
 * backend is cold-starting after a quiet period.
 */
export default function SessionSplash() {
  // The layout's <main> forms a stacking context below the sticky navbar, so
  // once mounted the splash portals to <body> to cover the whole viewport.
  // Before hydration it renders inline as a fallback.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const splash = (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#F8FAFC] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <p
        className="text-[var(--color-navy)] fade-in"
        style={{
          fontFamily: 'var(--font-fraunces), serif',
          fontSize: '2rem',
          fontWeight: 500,
          letterSpacing: '-0.035em',
          fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
        }}
      >
        Med<span className="italic font-normal">zae</span>
      </p>

      <div className="skeleton mt-6 h-1 w-44 rounded-full" aria-hidden />

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)] fade-in">
        Restoring your session
      </p>

      <p
        className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--color-text-secondary)]"
        style={{ animation: 'fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 5s both' }}
      >
        Waking up the server — the first visit after a quiet period can take up to a minute.
      </p>
    </div>
  );

  return mounted ? createPortal(splash, document.body) : splash;
}
