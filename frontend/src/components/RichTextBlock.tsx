'use client';

import { useEffect, useRef } from 'react';
import { sanitizeInlineHtml, toEditableHtml } from '@/lib/richText';

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

  return (
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
      onInput={emit}
      onBlur={emit}
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
  );
}
