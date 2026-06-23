import { describe, it, expect } from 'vitest';
import {
  layoutVisualLines,
  offsetToRowCol,
  rowColToOffset,
} from '../packages/tui/src/components/textLayout.js';

describe('textLayout.layoutVisualLines', () => {
  it('returns one empty line for an empty value', () => {
    expect(layoutVisualLines('', 10)).toEqual([{ start: 0, end: 0, hardBreak: false }]);
  });

  it('splits on hard newlines and records their offsets', () => {
    // "ab\ncd" → "ab" [0,2) hard, "cd" [3,5)
    expect(layoutVisualLines('ab\ncd', 10)).toEqual([
      { start: 0, end: 2, hardBreak: true },
      { start: 3, end: 5, hardBreak: false },
    ]);
  });

  it('yields a trailing empty line after a final newline', () => {
    expect(layoutVisualLines('ab\n', 10)).toEqual([
      { start: 0, end: 2, hardBreak: true },
      { start: 3, end: 3, hardBreak: false },
    ]);
  });

  it('soft-wraps by visual column without consuming a character', () => {
    // width 3: "abcdef" → "abc"[0,3) "def"[3,6)
    expect(layoutVisualLines('abcdef', 3)).toEqual([
      { start: 0, end: 3, hardBreak: false },
      { start: 3, end: 6, hardBreak: false },
    ]);
  });
});

describe('textLayout offset ⇄ row/col (round-trip exactness)', () => {
  const cases = ['', 'hello', 'ab\ncd', 'ab\n', 'abcdef', 'line one\nline two is longer'];
  for (const value of cases) {
    it(`maps every offset back to itself for ${JSON.stringify(value)}`, () => {
      const layout = layoutVisualLines(value, 4);
      for (let off = 0; off <= value.length; off++) {
        const { row, col } = offsetToRowCol(value, layout, off);
        const back = rowColToOffset(value, layout, row, col);
        // A soft-wrap boundary offset is represented as the next line's
        // col 0, which maps back to the same offset — so this is exact.
        expect(back).toBe(off);
      }
    });
  }

  it('puts a hard-break offset at end-of-line, not the next row', () => {
    const value = 'ab\ncd';
    const layout = layoutVisualLines(value, 10);
    // offset 2 is right before the '\n' → row 0, col 2
    expect(offsetToRowCol(value, layout, 2)).toEqual({ row: 0, col: 2 });
    // offset 3 is right after the '\n' → row 1, col 0
    expect(offsetToRowCol(value, layout, 3)).toEqual({ row: 1, col: 0 });
  });

  it('moves down one visual line keeping the column', () => {
    const value = 'abcdef'; // width 3 → rows "abc","def"
    const layout = layoutVisualLines(value, 3);
    // cursor at row 0 col 2 (between b and c) → down → row 1 col 2 → offset 5
    const down = rowColToOffset(value, layout, 1, 2);
    expect(down).toBe(5);
  });

  it('clamps the column when the target line is shorter', () => {
    const value = 'abcde\nx'; // width 10 → rows "abcde"(hard), "x"
    const layout = layoutVisualLines(value, 10);
    // from row 0 col 4 moving down to row 1 (only 1 char) → clamps to offset 7 (end)
    expect(rowColToOffset(value, layout, 1, 4)).toBe(value.length);
  });
});
