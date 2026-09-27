'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X,
  ExternalLink,
  Link2,
  Check,
  Stethoscope,
  Newspaper,
  UserRound,
  CalendarClock,
  Globe,
} from 'lucide-react';

// Shape of one article from GET /news. `author` and `content` are optional
// because a backend that predates them simply leaves them out.
export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content?: string;
  author?: string;
  imageUrl: string;
  url: string;
  tags: string[];
  source: string;
  specialty: string;
  timeAgo: string;
  publishedAt: string;
  featured?: boolean;
}

interface NewsDetailModalProps {
  article: NewsItem | null;
  onClose: () => void;
}

const COPIED_RESET_MS = 2000;

// Article URLs come from a third-party feed — only ever link out over http(s).
const safeExternalUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
};

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const formatPublished = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// NewsAPI's excerpt often just repeats the description; only show it when it
// adds something the reader hasn't already seen.
const extraExcerpt = (article: NewsItem) => {
  const content = article.content?.trim();
  if (!content) return '';
  const opening = content.slice(0, 80).toLowerCase();
  return article.summary.toLowerCase().includes(opening) ? '' : content;
};

export default function NewsDetailModal({ article, onClose }: NewsDetailModalProps) {
  const readRef = useRef<HTMLAnchorElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!article) return;
    setImageFailed(false);
    setCopied(false);
    readRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [article, onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!article) return null;

  const href = safeExternalUrl(article.url);
  const host = href ? hostnameOf(href) : '';
  const published = formatPublished(article.publishedAt);
  const excerpt = extraExcerpt(article);
  const showImage = Boolean(article.imageUrl) && !imageFailed;

  const handleCopy = async () => {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, permissions) — the
      // "Read full story" button still works, so fail quietly.
      setCopied(false);
    }
  };

  const details = [
    { icon: Newspaper, label: 'Publication', value: article.source },
    { icon: UserRound, label: 'Author', value: article.author },
    { icon: CalendarClock, label: 'Published', value: published && `${published} · ${article.timeAgo}` },
    { icon: Globe, label: 'Original link', value: host },
  ].filter(row => row.value);

  return (
    // Phones get a bottom sheet (full width, square bottom corners) so the
    // article has room to breathe; from `sm` up it's a centred card.
    <div className="modal-overlay !items-end !p-0 sm:!items-center sm:!p-4" onClick={onClose} role="presentation">
      <div
        className="modal-card !max-w-2xl flex flex-col max-h-[92dvh] !rounded-b-none sm:!rounded-[1.25rem] sm:max-h-[calc(100dvh-2rem)]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-detail-title"
      >
        <div className="overflow-y-auto">
          {/* Masthead image — sized off the viewport height so a landscape
              phone still shows the headline above the fold. */}
          <div
            className="relative bg-[var(--color-surface-elevated)] overflow-hidden shrink-0"
            style={{ height: 'clamp(6rem, 26vh, 16rem)' }}
          >
            {showImage ? (
              <img
                src={article.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center dot-grid">
                <Stethoscope className="w-14 h-14 text-[var(--color-border-strong)]" strokeWidth={1.25} />
              </div>
            )}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,11,51,0.55), rgba(0,11,51,0) 55%)' }}
            />
            <button
              onClick={onClose}
              className="icon-btn absolute top-3 right-3 !w-11 !h-11 sm:!w-9 sm:!h-9 !bg-white/90 hover:!bg-white !text-[var(--color-navy)] backdrop-blur-sm"
              aria-label="Close article details"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
            <div className="absolute left-5 sm:left-7 bottom-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-semibold text-white">
              <span>{article.specialty || 'Medicine'}</span>
              <span className="w-1 h-1 rounded-full bg-white/60" />
              <span className="text-white/80">{article.timeAgo}</span>
            </div>
          </div>

          <div className="px-5 sm:px-7 pt-6 pb-7">
            <h2
              id="news-detail-title"
              className="mb-4"
              style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: 'clamp(1.5rem, 2.6vw, 1.875rem)',
                fontWeight: 500,
                lineHeight: 1.14,
                letterSpacing: '-0.028em',
                color: 'var(--color-navy)',
              }}
            >
              {article.title}
            </h2>

            {article.summary && (
              <p className="body-lg text-[var(--color-text-body)] leading-relaxed">{article.summary}</p>
            )}

            {excerpt && (
              <blockquote className="mt-5 pl-4 border-l-2 border-[var(--color-border-strong)] body-md italic text-[var(--color-text-secondary)]">
                {excerpt}&hellip;
              </blockquote>
            )}

            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-5">
                {article.tags.map(tag => (
                  <span key={tag} className="badge badge-sm">{tag}</span>
                ))}
              </div>
            )}

            {/* Source details */}
            <div className="mt-7 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)] p-5">
              <p className="label !mb-4">Source details</p>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {details.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-soft)]" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">
                        {label}
                      </dt>
                      <dd className="text-sm font-medium text-[var(--color-navy)] break-words">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mt-4 text-xs text-[var(--color-text-muted)] leading-relaxed">
              This is a preview from the publisher&rsquo;s feed. The full story, and any updates to it, live on{' '}
              {article.source}.
            </p>
          </div>
        </div>

        {/* One row at every width: the copy action shrinks to an icon on
            phones and the source name truncates, so the footer never wraps
            into a tall block that eats the reading area. */}
        <div
          className="modal-foot !justify-between !px-4 sm:!px-6 !pt-3 sm:!pt-4"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleCopy}
            disabled={!href}
            aria-label={copied ? 'Link copied' : 'Copy link'}
            className="btn-secondary shrink-0 inline-flex items-center justify-center gap-2 !px-3.5 sm:!px-5"
          >
            {copied ? <Check className="w-4 h-4" strokeWidth={2} /> : <Link2 className="w-4 h-4" strokeWidth={1.75} />}
            <span className="hidden sm:inline">{copied ? 'Link copied' : 'Copy link'}</span>
          </button>
          {href ? (
            <a
              ref={readRef}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Read full story on ${article.source}`}
              className="btn-primary flex-1 sm:flex-initial min-w-0 inline-flex items-center justify-center gap-2"
            >
              <span className="truncate">
                Read full story<span className="hidden sm:inline"> on {article.source}</span>
              </span>
              <ExternalLink className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            </a>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">Original link unavailable</span>
          )}
        </div>
      </div>
    </div>
  );
}
