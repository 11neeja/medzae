'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeInlineHtml, toEditableHtml } from '@/lib/richText';
import { insertMention, mentionRect, readMentionContext } from '@/lib/mentions';
import MentionMenu from '@/components/MentionMenu';
import type { MentionUser } from '@/lib/api';

interface Props {
  /** Stored block text — plain, or the inline-HTML subset. */
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Enter without Shift — blocks use it to start the next one. */
  onEnter?: () => void;
  /** Backspace with the caret at the start of an empty block. */
  onBackspaceEmpty?: () => void;
  autoFocus?: boolean;
  onFocused?: () => void;
}

/**
 * A block of note text that can carry bold, italic, underline and colour.
 * contenteditable rather than a textarea, because a textarea can only ever
 * show one flat style — but the value stays a string, so nothing downstream
 * (saving, sharing, the AI import) has to know the difference.
 */
export default function RichTextBlock({
  value,
  onChange,
  className = '',
  placeholder,
  readOnly = false,
  onEnter,
  onBackspaceEmpty,
  autoFocus = false,
  onFocused,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // The last HTML this component emitted. Writing innerHTML on every render
  // would reset the caret to the start on every keystroke, so the DOM is only
  // resynced when the value changed somewhere else (a collaborator's edit, an
  // undo, a block switching type).
  const lastEmitted = useRef<string | null>(null);

  // The "@" picker, while one is being typed — null the rest of the time.
  const [mention, setMention] = useState<{ query: string; rect: DOMRect } | null>(null);
  // An "@" that was dismissed stays dismissed. Without this, finishing the
  // word after pressing Escape pops the picker back up on every keystroke.
  const dismissed = useRef<{ node: Node; at: number } | null>(null);
  // Portals need a DOM; this component renders on the server too.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    const next = toEditableHtml(value);
    if (el.innerHTML !== next) el.innerHTML = next;
    lastEmitted.current = value;
  }, [value]);

  // Newly inserted blocks (and the one a deletion leaves behind) take the caret.
  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    onFocused?.();
    // onFocused is a fresh closure each render; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    // execCommand only ever produces the tags we allow, but a paste or a
    // browser quirk can slip others in — clean before it reaches the store.
    const html = sanitizeInlineHtml(el.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  };

  // Re-read whatever the caret is sitting in. Deliberately tied to typing
  // rather than to every caret move: parking the cursor after an "@" written
  // an hour ago shouldn't reopen the picker.
  const syncMention = () => {
    const el = ref.current;
    if (!el || readOnly) {
      setMention(null);
      return;
    }

    const context = readMentionContext(el);
    if (!context) {
      // The caret has left that "@" behind; the next one starts fresh.
      dismissed.current = null;
      setMention(null);
      return;
    }
    if (dismissed.current?.node === context.node && dismissed.current.at === context.at) {
      setMention(null);
      return;
    }
    setMention({ query: context.query, rect: mentionRect(context) });
  };

  // Escape, or a click elsewhere: shut the picker and remember which "@" it
  // belonged to.
  const closeMention = () => {
    const el = ref.current;
    const context = el ? readMentionContext(el) : null;
    dismissed.current = context ? { node: context.node, at: context.at } : null;
    setMention(null);
  };

  // Swap the half-typed "@jd" for the chosen person. The context is read again
  // here rather than remembered: the caret is the source of truth, and the
  // picker never takes focus away from it.
  const pickMention = (user: MentionUser) => {
    const el = ref.current;
    setMention(null);
    if (!el) return;
    const context = readMentionContext(el);
    if (!context) return;
    dismissed.current = null;
    insertMention(context, user);
    emit();
  };

  // The canvas scrolls while you type near its edges; the menu follows rather
  // than being left behind or closing on a stray wheel nudge.
  const mentionOpen = mention !== null;
  useEffect(() => {
    if (!mentionOpen) return;
    const track = () => {
      const el = ref.current;
      if (!el) return;
      const context = readMentionContext(el);
      if (!context) return;
      const rect = mentionRect(context);
      setMention(prev => (prev ? { ...prev, rect } : prev));
    };
    window.addEventListener('scroll', track, true);
    window.addEventListener('resize', track);
    return () => {
      window.removeEventListener('scroll', track, true);
      window.removeEventListener('resize', track);
    };
  }, [mentionOpen]);

  return (
    <>
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        data-rich-block="true"
        spellCheck
        onInput={() => { emit(); syncMention(); }}
        onBlur={() => { emit(); setMention(null); }}
        onPaste={(e) => {
          if (readOnly) return;
          // Paste as text: anything else drags in styling from another app.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        onKeyDown={(e) => {
          if (readOnly) return;

          if (e.key === 'Enter') {
            // A picker with something to offer swallows Enter before this runs,
            // so reaching here means there was nothing to choose.
            setMention(null);

            if (e.shiftKey) {
              // Soft line break inside the block.
              e.preventDefault();
              document.execCommand('insertLineBreak');
              emit();
              return;
            }
            e.preventDefault();
            onEnter?.();
            return;
          }

          if (e.key === 'Backspace' && onBackspaceEmpty) {
            const el = ref.current;
            // "Empty" tolerates the single <br> the browser leaves behind when
            // you clear a block; two or more mean real (blank) lines to delete.
            const blank = !el?.textContent?.trim() && (el?.querySelectorAll('br').length || 0) <= 1;
            if (blank && window.getSelection()?.isCollapsed) {
              e.preventDefault();
              onBackspaceEmpty();
            }
          }
        }}
        className={`nb-rich ${className}`}
      />
      {mounted && mention && !readOnly && createPortal(
        <MentionMenu
          query={mention.query}
          rect={mention.rect}
          onPick={pickMention}
          onClose={closeMention}
        />,
        document.body
      )}
    </>
  );
}
