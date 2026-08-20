// Typing "@" in a note block starts a mention. This is the caret half of that:
// working out whether one is being typed right now, where it sits on screen,
// and swapping the half-typed "@jd" for a finished chip once someone is picked.
//
// It all runs against the live contenteditable DOM rather than the stored
// string, because only the DOM knows where the caret is.

import { MENTION_ATTR, MENTION_CLASS } from './richText';

export interface MentionContext {
  /** Text node holding the "@". */
  node: Text;
  /** Offset of the "@" inside that node. */
  at: number;
  /** Where the caret is inside that node. */
  caret: number;
  /** What has been typed after the "@" so far. */
  query: string;
}

/**
 * A name can be long ("Priya Venkataraman") but not unbounded — past this the
 * "@" was clearly the start of something else and the picker should let go.
 */
const MAX_QUERY = 32;

/**
 * "@" only opens the picker at a word boundary, and the query that follows
 * can't hold whitespace or another "@" — so an email address typed into a note
 * never summons it.
 */
const TRIGGER = /(?:^|[\s([{"'—–-])@([^\s@]*)$/;

/** The mention being typed at the caret, or null if there isn't one. */
export function readMentionContext(root: HTMLElement): MentionContext | null {
  if (typeof window === 'undefined') return null;

  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  // Only ever inside this block, and only inside real text — a caret parked on
  // an element boundary has no "@" behind it to read.
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;

  const caret = range.startOffset;
  const match = (node.nodeValue || '').slice(0, caret).match(TRIGGER);
  if (!match) return null;

  const query = match[1];
  if (query.length > MAX_QUERY) return null;

  return { node: node as Text, at: caret - query.length - 1, caret, query };
}

/** Where the "@" sits on screen, so the picker can hang off it. */
export function mentionRect(context: MentionContext): DOMRect {
  const range = document.createRange();
  // The "@" itself, not the collapsed caret: an empty range measures as a
  // zero-width box that some browsers report at the wrong place entirely.
  range.setStart(context.node, context.at);
  range.setEnd(context.node, Math.min(context.at + 1, context.node.length));
  return range.getBoundingClientRect();
}

/**
 * Replace the "@query" under the caret with a finished chip, and leave the
 * caret just after it so the sentence can carry on.
 */
export function insertMention(
  context: MentionContext,
  user: { id: string; name: string }
): void {
  const range = document.createRange();
  range.setStart(context.node, context.at);
  range.setEnd(context.node, context.caret);
  range.deleteContents();

  const chip = document.createElement('span');
  chip.setAttribute('class', MENTION_CLASS);
  chip.setAttribute(MENTION_ATTR, user.id);
  chip.setAttribute('contenteditable', 'false');
  chip.textContent = `@${user.name}`;

  // A non-breaking space: an ordinary one collapses at the end of a block,
  // leaving the caret nowhere to land once the chip is uneditable.
  const spacer = document.createTextNode('\u00A0');
  const fragment = document.createDocumentFragment();
  fragment.append(chip, spacer);
  range.insertNode(fragment);

  const after = document.createRange();
  after.setStart(spacer, spacer.length);
  after.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(after);
}
