// Inline formatting for notebook blocks. A block's text is stored as a tiny
// subset of HTML — bold, italic, underline, colour and line breaks — so it has
// to be sanitised on the way in AND on the way out: a note in a shared folder
// is written by one person and rendered in someone else's browser.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN']);

// Elements whose *contents* are as unwelcome as the tag: unwrapping a <script>
// would leave its source sitting in the note as visible text.
const DROP_WITH_CONTENTS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH',
]);

// Inline styles a span may keep. Browsers differ on whether execCommand emits
// tags or CSS, so the CSS forms are honoured rather than silently dropped.
const ALLOWED_STYLES: Record<string, RegExp> = {
  color: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i,
  'font-weight': /^(bold|[5-9]00)$/i,
  'font-style': /^italic$/i,
  'text-decoration': /^underline$/i,
  'text-decoration-line': /^underline$/i,
};

// An @-mention is a span the editor treats as one atom: the person's name,
// plus the id of who it points at. It's a reference the note's author left for
// themselves — never a link, and it notifies nobody.
export const MENTION_CLASS = 'nb-mention';
export const MENTION_ATTR = 'data-user-id';

// Ids are cuids; anything else in that attribute didn't come from the picker.
const MENTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

const isMention = (el: Element) =>
  el.tagName === 'SPAN' &&
  el.classList.contains(MENTION_CLASS) &&
  MENTION_ID.test(el.getAttribute(MENTION_ATTR) || '');

/**
 * True when a stored value carries formatting rather than being plain text.
 *
 * Entities count as well as tags: anything the editor saved came back out of
 * innerHTML, so "Hb &lt; 13" and the "&nbsp;" a trailing space becomes are
 * encoded text already. Escaping them a second time is what would turn a note
 * into "Hb &amp;lt; 13".
 */
export const looksLikeHtml = (value: string) =>
  /<(?:b|strong|i|em|u|br|span)\b[^>]*>/i.test(value) ||
  /&(?:amp|lt|gt|quot|nbsp|#\d+|#x[0-9a-f]+);/i.test(value);

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Strip everything that isn't inline formatting. Runs in the browser (DOMParser);
 * on the server it degrades to escaped plain text, which is only ever a
 * momentary state — blocks render after the client has fetched them.
 */
export function sanitizeInlineHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtml(html.replace(/<[^>]*>/g, ''));
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const clean = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    if (DROP_WITH_CONTENTS.has(el.tagName)) return null;

    const unwrap = () => {
      // Keep what the element was wrapping, drop the element itself.
      const fragment = doc.createDocumentFragment();
      el.childNodes.forEach(child => {
        const kept = clean(child);
        if (kept) fragment.appendChild(kept);
      });
      return fragment;
    };

    if (!ALLOWED_TAGS.has(el.tagName)) return unwrap();

    // A mention keeps exactly two attributes and nothing else — its text is
    // copied across as text, so no markup can ride into the note inside one.
    if (isMention(el)) {
      const chip = doc.createElement('span');
      chip.setAttribute('class', MENTION_CLASS);
      chip.setAttribute(MENTION_ATTR, el.getAttribute(MENTION_ATTR) as string);
      chip.textContent = el.textContent || '';
      return chip;
    }

    // Styles are read off whatever element carries them: applying a colour to
    // already-bold text puts it on the <b>/<u>, not in a fresh span.
    const style = (el as HTMLElement).style;
    const kept: string[] = [];
    for (const [property, pattern] of Object.entries(ALLOWED_STYLES)) {
      const declared = style?.getPropertyValue(property)?.trim();
      if (declared && pattern.test(declared)) kept.push(`${property}: ${declared}`);
    }

    // A span earns its keep only by carrying formatting we recognise; b/i/u
    // mean something on their own.
    if (el.tagName === 'SPAN' && kept.length === 0) return unwrap();

    const copy = doc.createElement(el.tagName.toLowerCase());
    if (kept.length > 0) copy.setAttribute('style', kept.join('; '));

    el.childNodes.forEach(child => {
      const kept = clean(child);
      if (kept) copy.appendChild(kept);
    });
    return copy;
  };

  const out = doc.createElement('div');
  root.childNodes.forEach(child => {
    const kept = clean(child);
    if (kept) out.appendChild(kept);
  });
  return out.innerHTML;
}

/**
 * What to put in a contenteditable for a stored value. Plain text is escaped
 * first, so a note that says "Hb < 13 g/dL" keeps its "<" instead of losing the
 * rest of the line to a phantom tag.
 */
export const toEditableHtml = (value: string) => {
  if (!looksLikeHtml(value)) return escapeHtml(value);

  const html = sanitizeInlineHtml(value);
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;

  // Mentions are atoms: contenteditable="false" makes the caret step over a
  // name instead of into it, so Backspace removes the whole chip rather than
  // leaving "@Jane Do" behind. The flag is a rendering detail — the sanitiser
  // above drops it again on the way back out, so it never reaches the store.
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;
  root.querySelectorAll(`span.${MENTION_CLASS}`).forEach(chip => {
    chip.setAttribute('contenteditable', 'false');
  });
  return root.innerHTML;
};

/** Formatting stripped back to readable text (previews, copies, exports). */
export function toPlainText(value: string): string {
  if (!looksLikeHtml(value)) return value;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
  }
  const doc = new DOMParser().parseFromString(value.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return doc.body.textContent || '';
}
