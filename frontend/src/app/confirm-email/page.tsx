'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { confirmEmailChangeAPI } from '@/lib/api';

function ConfirmEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('Confirming your new email address…');
  const [email, setEmail] = useState<string | null>(null);
  // React runs effects twice in dev StrictMode; the token is single-use, so a
  // second call would report "invalid link" over a successful confirmation.
  const confirmed = useRef(false);

  useEffect(() => {
    if (confirmed.current) return;
    confirmed.current = true;

    if (!token) {
      setStatus('failed');
      setMessage('This link is missing its confirmation token.');
      return;
    }

    confirmEmailChangeAPI(token)
      .then((result) => {
        setStatus('done');
        setEmail(result.email ?? null);
        setMessage(result.message || 'Your email address has been updated.');
      })
      .catch((err) => {
        setStatus('failed');
        setMessage(
          err?.response?.data?.message ||
            'We could not confirm this address. The link may have expired — request a new one from your profile.',
        );
      });
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="auth-card w-full max-w-md text-center">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5 ${
            status === 'failed' ? 'bg-red-50' : 'bg-[var(--color-accent-soft)]'
          }`}
        >
          {status === 'working' && (
            <Loader2 className="w-5 h-5 text-[var(--color-blue-primary)] animate-spin" />
          )}
          {status === 'done' && (
            <CheckCircle2 className="w-5 h-5 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
          )}
          {status === 'failed' && <XCircle className="w-5 h-5 text-red-600" strokeWidth={1.75} />}
        </div>

        <h1 className="heading-3">
          {status === 'working' && 'One moment'}
          {status === 'done' && 'Email confirmed'}
          {status === 'failed' && 'Confirmation failed'}
        </h1>

        <p className="body-md text-[var(--color-text-muted)] mt-3 leading-relaxed">{message}</p>

        {email && (
          <p className="text-sm font-semibold text-[var(--color-navy)] mt-3 break-words">{email}</p>
        )}

        {status !== 'working' && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
            <Link href="/profile" className="btn-primary !py-2 !px-4 text-sm">
              Go to your profile
            </Link>
            <Link href="/login" className="btn-ghost text-sm">
              Sign in
            </Link>
          </div>
        )}

        {status === 'done' && (
          <p className="text-xs text-[var(--color-text-soft)] mt-5 leading-relaxed">
            Use this address the next time you sign in.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[var(--color-blue-primary)] animate-spin" />
        </div>
      }
    >
      <ConfirmEmailInner />
    </Suspense>
  );
}
