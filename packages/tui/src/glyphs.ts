/**
 * Glyphs — unicode characters used in the UI. Centralised so we can
 * swap to ASCII fallbacks if a terminal renders boxes badly. Avoid
 * emoji (variable width, undefined behaviour) — cc uses the same
 * approach with the `figures` package.
 */

export const G = {
  pointer: '❯',       // focused list row indicator
  pointerFaint: '›',  // unfocused indent
  tick: '✓',          // selected/checked
  cross: '✗',         // failure
  arrowUp: '↑',
  arrowDown: '↓',
  arrowLeft: '←',
  arrowRight: '→',
  warning: '⚠',       // side-effect marker
  image: '▣',         // message carries an image attachment
  lock: '⏏',          // hard-block / locked
  pair: '↳',          // tool_use ↔ tool_result
  tool: '⚙',          // tool_use marker
  chain: '⌘',         // sidechain marker
  section: '§',       // compact-boundary marker
  ellipsis: '…',      // truncation marker (single char, unlike "...")
  bullet: '·',        // metadata separator
  dash: '─',          // divider line
  user: '›',          // user message marker
  assistant: '•',     // assistant marker
  search: '⌕',        // search affordance
  prompt: '▌',        // edit cursor block
  spin: '◐',          // loading
  corner: '╰',        // soft corner
  cornerUp: '╭',
} as const;

/** Soft word-wrap. Splits at whitespace when possible, otherwise
 *  hard-breaks. Returns an array of lines, none longer than `width`
 *  visible columns. cc's transcript renderer prefers hard breaks
 *  with indent; this matches that behaviour closely enough. */
export function wrapText(s: string, width: number): string[] {
  if (width <= 0) return [''];
  const out: string[] = [];
  for (const para of s.split('\n')) {
    if (para.length === 0) { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      if (visibleWidth(line + w) > width) {
        if (line) out.push(line);
        // very long single word — hard break
        let rest = w;
        while (visibleWidth(rest) > width) {
          out.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        line = rest;
      } else {
        line += w;
      }
    }
    if (line) out.push(line);
  }
  return out.length === 0 ? [''] : out;
}

/**
 * Visible width of a string in terminal columns. CJK / wide glyphs
 * count as 2; everything else as 1. A simplified clone of
 * `string-width` for our needs.
 */
export function visibleWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Hiragana, Katakana, Hangul, fullwidth, etc.
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/** Truncate a string to at most `maxWidth` terminal columns. */
export function truncate(s: string, maxWidth: number, suffix?: string): string {
  const tail = suffix ?? G.ellipsis;
  if (maxWidth <= 0) return '';
  if (visibleWidth(s) <= maxWidth) return s;
  const sw = visibleWidth(tail);
  if (maxWidth <= sw) return tail.slice(0, maxWidth);
  const budget = maxWidth - sw;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = visibleWidth(ch);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + tail;
}

/** Pad a string on the right to `width` columns. Negative width = no-op. */
export function padEnd(s: string, width: number): string {
  const diff = width - visibleWidth(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

/** Replace newlines and collapse whitespace — used for one-line previews. */
export function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
