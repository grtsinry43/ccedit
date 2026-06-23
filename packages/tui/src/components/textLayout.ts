/**
 * textLayout — offset-exact visual layout for MultiLineTextInput.
 *
 * The previous cursor model reconstructed positions by summing the
 * lengths of `wrapText`'s output. That is wrong: `wrapText` is a
 * *display* helper — it drops whitespace at wrap points and does not
 * carry the `\n` characters, so the offsets it implies do not line up
 * with the real string. The cursor drifted whenever the value wrapped
 * or had hard line breaks.
 *
 * This module instead produces a layout whose every visual line records
 * the exact `[start, end)` offset range it covers in the source string,
 * plus whether it ends at a hard `\n`. With that, offset ⇄ (row, col)
 * is exact and the renderer and the cursor math share one source of
 * truth.
 *
 * Wrapping is by visual column (not word-aware): each visual line holds
 * the longest prefix that fits in `width` columns. This keeps the
 * mapping trivially exact; correctness of the cursor matters more here
 * than pretty word wrapping.
 */
import { visibleWidth } from '../glyphs.js';

export interface VLine {
  /** Offset of the first character shown on this visual line. */
  start: number;
  /** Offset just past the last character shown (exclusive). For a
   *  hard-broken line this is the index of the `\n` itself. */
  end: number;
  /** True when this line is terminated by a `\n` in the source. */
  hardBreak: boolean;
}

/** Break `value` into visual lines for a given column budget. Always
 *  returns at least one line (an empty value yields a single empty line),
 *  and a trailing `\n` yields a final empty line so the cursor can sit
 *  on the row after it. */
export function layoutVisualLines(value: string, width: number): VLine[] {
  const w = Math.max(1, width);
  const out: VLine[] = [];
  let lineStart = 0;
  let col = 0;
  let pos = 0;
  for (const cp of value) {
    if (cp === '\n') {
      out.push({ start: lineStart, end: pos, hardBreak: true });
      pos += cp.length;
      lineStart = pos;
      col = 0;
      continue;
    }
    const cw = visibleWidth(cp);
    if (col + cw > w && pos > lineStart) {
      // Soft wrap: this codepoint does not fit, start a new visual line.
      out.push({ start: lineStart, end: pos, hardBreak: false });
      lineStart = pos;
      col = 0;
    }
    col += cw;
    pos += cp.length;
  }
  out.push({ start: lineStart, end: pos, hardBreak: false });
  return out;
}

/** Map a string offset to its (row, col) in the layout. `col` is a
 *  visual column. A position at a soft-wrap boundary maps to the start
 *  of the next line; a position at a hard break maps to the end of the
 *  broken line (just before the `\n`). */
export function offsetToRowCol(
  value: string,
  layout: VLine[],
  offset: number,
): { row: number; col: number } {
  const o = Math.max(0, Math.min(offset, value.length));
  for (let r = 0; r < layout.length; r++) {
    const ln = layout[r];
    const isLast = r === layout.length - 1;
    const ownsEnd = ln.hardBreak || isLast;
    if (o >= ln.start && (o < ln.end || (ownsEnd && o <= ln.end))) {
      return { row: r, col: visibleWidth(value.slice(ln.start, o)) };
    }
  }
  const last = layout[layout.length - 1];
  return { row: layout.length - 1, col: visibleWidth(value.slice(last.start, last.end)) };
}

/** Map a (row, target visual col) back to a string offset, clamped to
 *  the row's content. Used for vertical cursor movement. */
export function rowColToOffset(
  value: string,
  layout: VLine[],
  row: number,
  targetCol: number,
): number {
  const r = Math.max(0, Math.min(row, layout.length - 1));
  const ln = layout[r];
  let off = ln.start;
  let col = 0;
  for (const cp of value.slice(ln.start, ln.end)) {
    const cw = visibleWidth(cp);
    if (col + cw > targetCol) break;
    col += cw;
    off += cp.length;
  }
  return off;
}
