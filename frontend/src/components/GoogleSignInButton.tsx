'use client';

import { useEffect, useRef, useState } from 'react';

// Official "Sign in with Google" button (Google Identity Services).
// Loads Google's script, renders their button, and hands the resulting
// ID-token credential to `onCredential` — the page decides what to do
// with it (exchange it for a Medzae session via the backend).
//
// Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset or the
// script cannot load (ad blockers), so the email/password form always
// remains the fallback.

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const BUTTON_HEIGHT = 44;
const MAX_BUTTON_WIDTH = 400; // GIS renders at most 400px wide

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

const loadGsiScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiScriptPromise = null;
        reject(new Error('Google sign-in script failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return gsiScriptPromise;
};

interface GoogleSignInButtonProps {
  /** Exchanges the Google credential for a session; errors are the caller's to show. */
  onCredential: (credential: string) => Promise<void>;
  /** Button label variant — 'signin_with' (login) or 'signup_with' (signup). */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [busy, setBusy] = useState(false);

  // The GIS callback is registered once, but rememberMe (captured by
  // onCredential) can change afterwards — always call the latest handler.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;

    loadGsiScript()
      .then(() => {
        const container = containerRef.current;
        const gsi = window.google?.accounts?.id;
        if (cancelled || !container || !gsi) return;

        gsi.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (!response?.credential) return;
            setBusy(true);
            Promise.resolve(onCredentialRef.current(response.credential))
              .catch(() => {}) // page already surfaced the error
              .finally(() => setBusy(false));
          },
        });

        container.innerHTML = ''; // dev strict-mode remounts render twice otherwise
        gsi.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          logo_alignment: 'left',
          text,
          width: Math.min(MAX_BUTTON_WIDTH, container.offsetWidth || MAX_BUTTON_WIDTH),
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!CLIENT_ID || status === 'unavailable') return null;

  return (
    <div>
      {/* Divider lives here so it disappears together with the button when
          Google sign-in is unavailable (no client id, blocked script). */}
      <div className="my-6 flex items-center gap-4" aria-hidden="true">
        <div className="h-px flex-1 bg-[var(--color-border-light)]" />
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
          or
        </span>
        <div className="h-px flex-1 bg-[var(--color-border-light)]" />
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className={`flex justify-center transition-opacity ${busy ? 'pointer-events-none opacity-30' : ''}`}
          style={{ minHeight: BUTTON_HEIGHT }}
        />

        {status === 'loading' && (
          <div
            className="skeleton absolute inset-0 rounded-lg"
            style={{ height: BUTTON_HEIGHT }}
            aria-hidden="true"
          />
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-navy)]">
            <div className="w-4 h-4 border-2 border-[var(--color-blue-primary)] border-t-transparent rounded-full animate-spin" />
            Signing you in…
          </div>
        )}
      </div>
    </div>
  );
}
