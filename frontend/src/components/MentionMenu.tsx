'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, CornerDownLeft } from 'lucide-react';
import { searchMentionUsersAPI, type MentionUser } from '@/lib/api';
import { resolveAvatar } from '@/components/avatars/avatarData';

interface Props {
  /** What has been typed after the "@" so far. */
  query: string;
  /** Where the "@" sits on screen — the menu hangs off it. */
  rect: DOMRect;
  onPick: (user: MentionUser) => void;
  onClose: () => void;
}

const MENU_WIDTH = 272;
const GAP = 6;

/**
 * Results are cached for the life of the tab. The same handful of queries come
 * back constantly — every "@" starts at "", then "j", then "jd" — and the set
 * of people on Medzae doesn't change between two keystrokes.
 */
const cache = new Map<string, MentionUser[]>();

/**
 * The "@" picker for note blocks.
 *
 * Unlike the block menu it has no field of its own: you keep typing into the
 * note and the list narrows underneath. That means the keyboard has to be
 * intercepted before React sees it — hence the capture-phase listener, which
 * stops Enter from splitting the block while a name is being chosen.
 */
export default function MentionMenu({ query, rect, onPick, onClose }: Props) {
  const [results, setResults] = useState<MentionUser[]>(() => cache.get(query.toLowerCase()) ?? []);
  const [loading, setLoading] = useState(!cache.has(query.toLowerCase()));
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only the keyboard should scroll the list; doing it on hover drags the
  // whole editor around under the cursor.
  const keyboardNav = useRef(false);

  // Debounced search. The guard on `stale` matters more than usual here: you
  // can out-type the network easily, and a slow "j" must never overwrite the
  // results for "jd".
  useEffect(() => {
    const key = query.toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }

    let stale = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchMentionUsersAPI(query);
        // Anything but a list means the request was answered by something
        // other than the API (a login redirect, a proxy) — show nothing
        // rather than taking the editor down with it.
        const users = Array.isArray(found) ? found : [];
        cache.set(key, users);
        if (!stale) setResults(users);
      } catch (error) {
        console.error('Mention search failed:', error);
        if (!stale) setResults([]);
      } finally {
        if (!stale) setLoading(false);
      }
    }, 140);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  // Keep the highlighted row in view while arrowing down a long list.
  useEffect(() => {
    if (!keyboardNav.current) return;
    keyboardNav.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const pick = useCallback((user: MentionUser) => onPick(user), [onPick]);

  // Capture phase on the document: React's handlers are bound to the app root,
  // so stopping the event here keeps the note block from also acting on it.
  // Anything we don't claim — letters, Backspace — falls through untouched and
  // keeps editing the query.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (results.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        keyboardNav.current = true;
        const step = e.key === 'ArrowDown' ? 1 : results.length - 1;
        setActiveIndex(i => (i + step) % results.length);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = results[activeIndex];
        // With nothing to choose, Enter belongs to the note — it should start
        // the next block, not sit there doing nothing.
        if (!chosen) return;
        e.preventDefault();
        e.stopPropagation();
        pick(chosen);
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [results, activeIndex, pick, onClose]);

  // Click-away. Rows preventDefault on mousedown instead, so picking with the
  // mouse never pulls the caret out of the block.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // Flip above the caret when there's no room below. On phones the on-screen
  // keyboard eats the bottom of the window without changing innerHeight, so
  // the visual viewport is the honest measure of what's actually visible.
  const style = useMemo<React.CSSProperties>(() => {
    if (typeof window === 'undefined') return {};
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - GAP * 2;
    const spaceAbove = rect.top - GAP * 2;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(288, openUp ? spaceAbove : spaceBelow));
    const left = Math.min(
      Math.max(GAP, rect.left),
      Math.max(GAP, window.innerWidth - MENU_WIDTH - GAP)
    );
    return {
      position: 'fixed',
      left,
      width: MENU_WIDTH,
      maxHeight,
      ...(openUp
        ? { bottom: Math.max(GAP, viewportHeight - rect.top + GAP) }
        : { top: rect.bottom + GAP }),
    };
  }, [rect]);

  return (
    <div ref={menuRef} className="nb-menu z-[70] fade-in" style={style} role="listbox" aria-label="Mention someone">
      <div className="nb-menu-search">
        <AtSign className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.75} />
        <span className="flex-1 min-w-0 truncate text-[0.8125rem] text-[var(--color-text-primary)]">
          {query || <span className="text-[var(--color-text-soft)]">Name or initials…</span>}
        </span>
        <kbd className="nb-kbd hidden sm:inline-flex items-center gap-1">
          <CornerDownLeft className="w-2.5 h-2.5" strokeWidth={2} />
        </kbd>
      </div>

      <div ref={listRef} className="nb-menu-list">
        {loading && results.length === 0 ? (
          [0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2" style={{ opacity: 1 - i * 0.25 }}>
              <div className="skeleton w-7 h-7 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="skeleton h-3 w-24 mb-1.5" />
                <div className="skeleton h-2.5 w-32" />
              </div>
            </div>
          ))
        ) : results.length === 0 ? (
          <p
            className="px-3 py-6 text-center text-[0.8125rem] text-[var(--color-text-soft)] italic"
            style={{ fontFamily: 'var(--font-fraunces), serif' }}
          >
            {query ? <>No one matches &ldquo;{query}&rdquo;.</> : 'No one to mention yet.'}
          </p>
        ) : (
          results.map((user, index) => {
            const avatar = resolveAvatar(user.avatarUrl, user.name);
            return (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-index={index}
                data-active={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                // Keep the caret in the note: a blur here would lose the "@"
                // we're about to replace.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(user)}
                className="nb-menu-item"
              >
                {avatar.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-[var(--color-blue-soft)] text-[var(--color-navy)]"
                    style={avatar.background ? { background: avatar.background, color: avatar.foreground ?? '#fff' } : undefined}
                  >
                    {avatar.initials}
                  </span>
                )}
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-[0.8125rem] font-semibold text-[var(--color-navy)] tracking-tight truncate">{user.name}</span>
                  <span className="block text-[11px] text-[var(--color-text-soft)] truncate">{user.email}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
