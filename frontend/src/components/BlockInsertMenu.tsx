'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heading, Heading2, Type, CheckSquare, List, ListOrdered,
  Quote, Lightbulb, Sigma, Minus, Search, CornerDownLeft,
} from 'lucide-react';

export type BlockType =
  | 'heading' | 'subheading' | 'text' | 'checklist' | 'bullet'
  | 'numbered' | 'quote' | 'callout' | 'code' | 'divider';

interface BlockOption {
  type: BlockType;
  label: string;
  desc: string;
  Icon: typeof Type;
  kbd: string;
  group: string;
  /** Extra words the filter should match, beyond the label. */
  keywords: string;
}

export const BLOCK_OPTIONS: BlockOption[] = [
  { type: 'text', label: 'Text', desc: 'Plain paragraph', Icon: Type, kbd: 'T', group: 'Write', keywords: 'paragraph body plain paragraph' },
  { type: 'heading', label: 'Heading', desc: 'Section title', Icon: Heading, kbd: 'H1', group: 'Write', keywords: 'title h1 big' },
  { type: 'subheading', label: 'Subheading', desc: 'Smaller section title', Icon: Heading2, kbd: 'H2', group: 'Write', keywords: 'title h2 sub small' },
  { type: 'bullet', label: 'Bullet list', desc: 'Simple list', Icon: List, kbd: '·', group: 'Organise', keywords: 'unordered point dash' },
  { type: 'numbered', label: 'Numbered list', desc: 'Steps in order', Icon: ListOrdered, kbd: '1.', group: 'Organise', keywords: 'ordered steps sequence' },
  { type: 'checklist', label: 'To-do list', desc: 'Track tasks', Icon: CheckSquare, kbd: '☐', group: 'Organise', keywords: 'task checkbox tick' },
  { type: 'callout', label: 'Key point', desc: 'Highlight what matters', Icon: Lightbulb, kbd: '!', group: 'Emphasise', keywords: 'callout note important tip warning highlight' },
  { type: 'quote', label: 'Quote', desc: 'Cite a source', Icon: Quote, kbd: '"', group: 'Emphasise', keywords: 'blockquote citation reference' },
  { type: 'code', label: 'Formula', desc: 'Monospaced, kept verbatim', Icon: Sigma, kbd: 'fx', group: 'Emphasise', keywords: 'formula equation calculation dosage maths code snippet mono pre' },
  { type: 'divider', label: 'Divider', desc: 'Visual break', Icon: Minus, kbd: '—', group: 'Emphasise', keywords: 'separator rule line break' },
];

interface Props {
  /** Where the menu opens from — the trigger button, or the block holding "/". */
  anchor: DOMRect;
  /** Clicks inside this element don't count as "outside" (it's the toggle). */
  anchorEl?: HTMLElement | null;
  onPick: (type: BlockType) => void;
  onClose: () => void;
}

const MENU_WIDTH = 288;
const GAP = 8;

/**
 * Block picker for the note editor. Positioned fixed against its anchor so it
 * never gets clipped by the scrolling canvas, flipping above the anchor when
 * the space below is too tight, and becoming a bottom sheet on small screens.
 * Filterable and fully keyboard-driven.
 */
export default function BlockInsertMenu({ anchor, anchorEl, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Live anchor rect: the menu follows its trigger rather than closing when
  // anything on the page scrolls.
  const [rect, setRect] = useState<DOMRect>(anchor);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the keyboard should scroll the list — doing it on hover scrolls an
  // ancestor too, which used to yank the menu around under the cursor.
  const keyboardNav = useRef(false);

  // Sheet on phones; anchored popover everywhere else.
  const [isSheet, setIsSheet] = useState(false);
  useEffect(() => {
    setIsSheet(window.matchMedia('(max-width: 639.98px)').matches);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOCK_OPTIONS;
    return BLOCK_OPTIONS.filter(o =>
      o.label.toLowerCase().includes(q) || o.keywords.includes(q) || o.type.includes(q)
    );
  }, [query]);

  useEffect(() => { setActiveIndex(0); }, [query]);
  // preventScroll: focusing normally scrolls ancestors to reveal the field,
  // which would move the page out from under the menu the moment it opens.
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!keyboardNav.current) return;
    keyboardNav.current = false;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Escape closes; arrows move; Enter inserts. Bound to the document so it
  // works no matter which of the menu's fields has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        keyboardNav.current = true;
        setActiveIndex(i => (results.length ? (i + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        keyboardNav.current = true;
        setActiveIndex(i => (results.length ? (i - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter') {
        const pick = results[activeIndex];
        if (pick) {
          e.preventDefault();
          onPick(pick.type);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [results, activeIndex, onPick, onClose]);

  // Track the trigger while the page moves. Closing on every scroll was too
  // trigger-happy — a stray wheel nudge, or the browser revealing a focused
  // field, made the menu vanish the moment it opened. It only gives up when
  // the trigger itself has left the viewport. (The sheet is viewport-pinned
  // and doesn't care.)
  useEffect(() => {
    if (isSheet || !anchorEl) return;
    const reposition = () => {
      const next = anchorEl.getBoundingClientRect();
      const offScreen = next.bottom < 0 || next.top > window.innerHeight;
      if (offScreen) onClose();
      else setRect(next);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isSheet, anchorEl, onClose]);

  // Click-away, ignoring the trigger so it doesn't close and reopen.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchorEl, onClose]);

  // Flip up when there isn't room below, and never grow past the viewport.
  const placement = useMemo(() => {
    if (typeof window === 'undefined') return { style: {} as React.CSSProperties, openUp: false };
    const spaceBelow = window.innerHeight - rect.bottom - GAP * 2;
    const spaceAbove = rect.top - GAP * 2;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(400, openUp ? spaceAbove : spaceBelow));
    const left = Math.min(
      Math.max(GAP, rect.left),
      Math.max(GAP, window.innerWidth - MENU_WIDTH - GAP)
    );
    return {
      openUp,
      style: {
        position: 'fixed',
        left,
        width: MENU_WIDTH,
        maxHeight,
        ...(openUp
          ? { bottom: Math.max(GAP, window.innerHeight - rect.top + GAP) }
          : { top: Math.min(rect.bottom + GAP, window.innerHeight - 180) }),
      } as React.CSSProperties,
    };
  }, [rect]);

  const rows = (
    <div ref={listRef} className="nb-menu-list">
      {results.length === 0 ? (
        <p className="px-3 py-6 text-center text-[0.8125rem] text-[var(--color-text-soft)] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        results.map((option, index) => {
          const isFirstOfGroup = index === 0 || results[index - 1].group !== option.group;
          return (
            <div key={option.type}>
              {isFirstOfGroup && (
                <p className="label !mb-0 px-3 pt-2.5 pb-1.5">{option.group}</p>
              )}
              <button
                type="button"
                data-index={index}
                data-active={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(option.type)}
                className="nb-menu-item"
              >
                <span className="nb-menu-icon">
                  <option.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.8125rem] font-semibold text-[var(--color-navy)] tracking-tight">{option.label}</span>
                  <span className="block text-[11px] text-[var(--color-text-soft)] truncate">{option.desc}</span>
                </span>
                <kbd className="nb-kbd shrink-0">{option.kbd}</kbd>
              </button>
            </div>
          );
        })
      )}
    </div>
  );

  const header = (
    <div className="nb-menu-search">
      <Search className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.75} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter blocks…"
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[0.8125rem] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-soft)]"
        aria-label="Filter blocks"
      />
      <kbd className="nb-kbd hidden sm:inline-flex items-center gap-1">
        <CornerDownLeft className="w-2.5 h-2.5" strokeWidth={2} />
      </kbd>
    </div>
  );

  if (isSheet) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-[rgba(0,11,51,0.35)] backdrop-blur-[2px] fade-in" onClick={onClose} />
        <div ref={menuRef} className="nb-menu nb-menu-sheet z-50" role="menu">
          {header}
          {rows}
        </div>
      </>
    );
  }

  return (
    <div ref={menuRef} className="nb-menu z-50 fade-in" style={placement.style} role="menu">
      {header}
      {rows}
    </div>
  );
}
