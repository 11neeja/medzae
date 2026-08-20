import Link from 'next/link';
import { ArrowLeft, Sparkles, ShieldCheck, Cpu, MessageCircle } from 'lucide-react';
import { ZAE } from '@/lib/zae';

/**
 * Zae's profile. Deliberately a server component with no API call of its own —
 * she is not a database row, and this page has to render instantly whether or
 * not the backend is awake.
 */
export default function ZaeProfilePage() {
  return (
    <div className="page-container py-8 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/assistant"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-navy)] transition-smooth mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to chat
        </Link>

        {/* Hero */}
        <section className="card overflow-hidden mb-6">
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <div
              className="flex items-end justify-center px-6 pt-6 sm:pt-8 sm:px-8 shrink-0"
              style={{ background: 'var(--color-accent-soft)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ZAE.portrait}
                alt={`${ZAE.name}, ${ZAE.role}`}
                width={301}
                height={487}
                className="w-36 sm:w-40 h-auto select-none pointer-events-none"
              />
            </div>

            <div className="min-w-0 flex-1 p-6 sm:p-8">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="heading-3">{ZAE.name}</h1>
                <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] px-2 py-1 rounded-full">
                  <Sparkles className="w-3 h-3" strokeWidth={2} />
                  AI assistant
                </span>
              </div>

              <p className="body-md text-[var(--color-text-body)] mt-1.5">{ZAE.headline}</p>

              <p className="body-sm text-[var(--color-text-muted)] mt-4 leading-relaxed">
                {ZAE.intro}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-5">
                <Link
                  href="/assistant"
                  className="btn-primary !py-1.5 !px-3.5 text-[0.8125rem] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Ask {ZAE.name}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="card p-6 sm:p-8 mb-6">
          <p className="label">About</p>
          <div className="mt-2 space-y-3">
            {ZAE.about.map((paragraph) => (
              <p key={paragraph} className="body-md text-[var(--color-text-body)] leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* What she can do */}
        <section className="card p-6 sm:p-8 mb-6">
          <p className="label">What {ZAE.name} can do</p>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {ZAE.strengths.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface-muted)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{item.title}</p>
                <p className="body-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Limits — the part a medical tool owes its users */}
        <section className="card p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
            <p className="label !mb-0">Good to know</p>
          </div>
          <ul className="mt-3 space-y-2.5">
            {ZAE.limits.map((limit) => (
              <li
                key={limit}
                className="body-sm text-[var(--color-text-body)] leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.5em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[var(--color-blue-primary)]"
              >
                {limit}
              </li>
            ))}
          </ul>
        </section>

        {/* Under the hood */}
        <section className="card p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
            <p className="label !mb-0">Under the hood</p>
          </div>
          <p className="body-sm text-[var(--color-text-body)] mt-3 leading-relaxed">
            {ZAE.underTheHood}
          </p>
        </section>
      </div>
    </div>
  );
}
