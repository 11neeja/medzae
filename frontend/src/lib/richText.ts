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

/** True when a stored value carries formatting rather than being plain text. */
export const looksLikeHtml = (value: string) =>
  /<(?:b|strong|i|em|u|br|span)\b[^>]*>/i.test(value);

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
export const toEditableHtml = (value: string) =>
  looksLikeHtml(value) ? sanitizeInlineHtml(value) : escapeHtml(value);

/** Formatting stripped back to readable text (previews, copies, exports). */
export function toPlainText(value: string): string {
  if (!looksLikeHtml(value)) return value;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
  }
  const doc = new DOMParser().parseFromString(value.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return doc.body.textContent || '';
}
