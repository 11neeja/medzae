// Converts assistant markdown replies into the Notebook's block vocabulary.
// Constructs map to the block that reads closest, and anything without a home
// degrades to text rather than leaking raw syntax:
//   - # / ## …    → heading / subheading
//   - > quote     → quote block, or a callout when tagged ([!TIP], [!WARNING])
//   - code fences → code block, kept verbatim
//   - 1. item     → numbered list
//   - tables      → one bullet per row, cells paired with their column header
//   - inline **bold** / ==highlight== / `code` markers are stripped
// Used by the assistant's "Save to Notebook" and the notebook's "Add note
// from AI" — keep both flows on this single implementation.

export interface NoteBlockInput {
  type:
    | 'heading' | 'subheading' | 'text' | 'bullet' | 'numbered'
    | 'checklist' | 'quote' | 'callout' | 'code' | 'divider';
  text: string;
  checked?: boolean;
}

const CALLOUT_LABELS: Record<string, string> = {
  KEY: '📌 Key point', IMPORTANT: '📌 Key point', TAKEAWAY: '📌 Key point',
  NOTE: 'ℹ️ Note', INFO: 'ℹ️ Note', PEARL: 'ℹ️ Note',
  TIP: '💡 Study tip', HINT: '💡 Study tip', MNEMONIC: '💡 Study tip',
  WARNING: '⚠️ Caution', CAUTION: '⚠️ Caution', DANGER: '⚠️ Caution',
};

const stripInline = (s: string) =>
  s.replace(/\*\*/g, '').replace(/==/g, '').replace(/`/g, '').trim();

const isTableRow = (line: string) => /^\|.*\|$/.test(line);
const isTableSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-');
const splitRow = (line: string) =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => stripInline(cell));

export function markdownToBlocks(markdown: string): NoteBlockInput[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: NoteBlockInput[] = [];
  let textRun: string[] = [];

  const flushText = () => {
    if (textRun.length === 0) return;
    const content = textRun.join('\n').trim();
    if (content) blocks.push({ type: 'text', text: content });
    textRun = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      flushText();
      i++;
      continue;
    }

    // Fenced code block → code block, contents verbatim, fences dropped
    if (line.startsWith('```')) {
      flushText();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence (harmless if it was missing)
      const content = codeLines.join('\n').trim();
      if (content) blocks.push({ type: 'code', text: content });
      continue;
    }

    // Table → one bullet per row: "First cell — Header: value · Header: value"
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableRow(lines[i + 1].trim()) &&
      isTableSeparator(lines[i + 1].trim())
    ) {
      flushText();
      const header = splitRow(line);
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) {
        const cells = splitRow(lines[i].trim());
        const label = cells[0] || '';
        const rest = cells
          .slice(1)
          .map((cell, ci) => (cell && header[ci + 1] ? `${header[ci + 1]}: ${cell}` : cell))
          .filter(Boolean)
          .join(' · ');
        const rowText = rest ? `${label} — ${rest}` : label;
        if (rowText) blocks.push({ type: 'bullet', text: rowText });
        i++;
      }
      continue;
    }

    // Blockquote → quote block; a tagged one ([!TIP] …) becomes a callout
    if (line.startsWith('>')) {
      flushText();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const joined = quoteLines.join(' ').replace(/\s+/g, ' ').trim();
      const marker = joined.match(/^\[!(\w+)\]\s*/);
      const label = marker ? CALLOUT_LABELS[marker[1].toUpperCase()] : undefined;
      const content = stripInline(joined.replace(/^\[!(\w+)\]\s*/, ''));
      if (label) blocks.push({ type: 'callout', text: content ? `${label}: ${content}` : label });
      else if (content) blocks.push({ type: 'quote', text: content });
      continue;
    }

    // Headings: # is the section title, deeper levels are subheadings
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushText();
      blocks.push({
        type: heading[1].length === 1 ? 'heading' : 'subheading',
        text: stripInline(heading[2]),
      });
      i++;
      continue;
    }

    // Bold-only line as heading: **Some Title**
    if (/^\*\*[^*]+\*\*[:\s]*$/.test(line)) {
      flushText();
      blocks.push({ type: 'heading', text: line.replace(/^\*\*/, '').replace(/\*\*[:\s]*$/, '').trim() });
      i++;
      continue;
    }

    // Dividers: ---, ***, ___
    if (/^[-*_]{3,}$/.test(line)) {
      flushText();
      blocks.push({ type: 'divider', text: '' });
      i++;
      continue;
    }

    // Checklist items: - [ ] or - [x]
    const check = line.match(/^[-*]\s*\[([ xX])\]\s+(.*)$/);
    if (check) {
      flushText();
      blocks.push({ type: 'checklist', text: stripInline(check[2]), checked: /[xX]/.test(check[1]) });
      i++;
      continue;
    }

    // Ordered steps: "1. item" / "1) item"
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushText();
      blocks.push({ type: 'numbered', text: stripInline(numbered[1]) });
      i++;
      continue;
    }

    // Bullet points: - item, * item, • item
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushText();
      blocks.push({ type: 'bullet', text: stripInline(bullet[1]) });
      i++;
      continue;
    }

    // Regular text line — accumulate
    textRun.push(stripInline(line));
    i++;
  }

  flushText();

  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: stripInline(markdown) });
  }

  return blocks;
}
