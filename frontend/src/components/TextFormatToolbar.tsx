'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bold, Italic, Underline, RemoveFormatting } from 'lucide-react';

/** Ink colours for note text — the palette, not a free-for-all colour picker. */
const COLOURS: { name: string; value: string }[] = [
  { name: 'Ink', value: '#000B33' },
  { name: 'Blue', value: '#0B3B91' },
  { name: 'Teal', value: '#0F766E' },
  { name: 'Amber', value: '#B45309' },
  { name: 'Red', value: '#B91C1C' },
  { name: 'Violet', value: '#6D28D9' },
];

interface Props {
  /** Optional hook for after a command runs; saving is handled internally. */
  onFormatted?: () => void;
}

interface Placement {
  left: number;
  top: number;
  above: boolean;
}

const TOOLBAR_WIDTH = 268;
const TOOLBAR_HEIGHT = 40;
const GAP = 8;

/** The editable block a selection boundary sits in, if any. */
const blockOf = (node: Node | null | undefined): HTMLElement | null =>
  ((node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement)
    ?.closest('[data-rich-block="true"]') as HTMLElement | null) ?? null;

/**
 * Formatting bar that surfaces only when text inside a note block is selected,
 * anchored to the selection itself. Deliberately small: bold, italic,
 * underline, six colours, and a way back to plain.
 */
export default function TextFormatToolbar({ onFormatted }: Props) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPlacement(null);
      return;
    }

    // Only for text inside an editable block — not the sidebar, not a title.
    // Both ends must be in the *same* block: each block is its own editable, so
    // a selection spanning two of them can only ever format the first, which
    // looks broken. Better to offer nothing than to do a fraction of the job.
    const anchorHost = blockOf(selection.anchorNode);
    const focusHost = blockOf(selection.focusNode);
    if (
      !anchorHost ||
      anchorHost !== focusHost ||
      anchorHost.getAttribute('contenteditable') !== 'true'
    ) {
      setPlacement(null);
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setPlacement(null);
      return;
    }

    const above = rect.top > TOOLBAR_HEIGHT + GAP * 2;
    setPlacement({
      left: Math.min(
        Math.max(GAP, rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2),
        Math.max(GAP, window.innerWidth - TOOLBAR_WIDTH - GAP)
      ),
      top: above ? rect.top - TOOLBAR_HEIGHT - GAP : Math.min(rect.bottom + GAP, window.innerHeight - TOOLBAR_HEIGHT - GAP),
      above,
    });

    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      // queryCommandState throws on some browsers when the selection is odd.
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', readSelection);
    window.addEventListener('scroll', readSelection, true);
    window.addEventListener('resize', readSelection);
    return () => {
      document.removeEventListener('selectionchange', readSelection);
      window.removeEventListener('scroll', readSelection, true);
      window.removeEventListener('resize', readSelection);
    };
  }, [readSelection]);

  if (!placement) return null;

  const run = (command: string, value?: string) => {
    const host = blockOf(window.getSelection()?.anchorNode);

    // Colour has to be an inline style (the alternative is the legacy <font>
    // tag), but bold/italic/underline are better off as <b>/<i>/<u> — as CSS
    // spans they'd be indistinguishable from arbitrary styling and get
    // stripped by the sanitiser on the way to the server.
    document.execCommand('styleWithCSS', false, command === 'foreColor' ? 'true' : 'false');
    document.execCommand(command, false, value);

    // execCommand doesn't reliably raise React's onInput, and an unsaved
    // format would be lost on reload — nudge the block to persist itself.
    host?.dispatchEvent(new Event('input', { bubbles: true }));
    onFormatted?.();
    readSelection();
  };

  return (
    <div
      className="nb-format-bar fade-in"
      style={{ left: placement.left, top: placement.top, width: TOOLBAR_WIDTH }}
      // Keep the selection alive: a mousedown elsewhere would collapse it
      // before the command ever runs.
      onMouseDown={(e) => e.preventDefault()}
      role="toolbar"
      aria-label="Text formatting"
    >
      <button type="button" onClick={() => run('bold')} data-active={active.bold} className="nb-format-btn" title="Bold">
        <Bold strokeWidth={2.5} />
      </button>
      <button type="button" onClick={() => run('italic')} data-active={active.italic} className="nb-format-btn" title="Italic">
        <Italic strokeWidth={2.5} />
      </button>
      <button type="button" onClick={() => run('underline')} data-active={active.underline} className="nb-format-btn" title="Underline">
        <Underline strokeWidth={2.5} />
      </button>

      <span className="nb-format-sep" aria-hidden />

      {COLOURS.map(colour => (
        <button
          type="button"
          key={colour.value}
          onClick={() => run('foreColor', colour.value)}
          className="nb-format-swatch"
          style={{ background: colour.value }}
          title={colour.name}
          aria-label={`${colour.name} text`}
        />
      ))}

      <span className="nb-format-sep" aria-hidden />

      <button type="button" onClick={() => run('removeFormat')} className="nb-format-btn" title="Clear formatting">
        <RemoveFormatting strokeWidth={2} />
      </button>
    </div>
  );
}
