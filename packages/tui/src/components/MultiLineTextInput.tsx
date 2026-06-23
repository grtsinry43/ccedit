/**
 * MultiLineTextInput — Ink input box with multi-line cursor
 * semantics modelled on cc's `useTextInput`:
 *
 *   - Enter:           submit (calls `onSubmit` with the current value)
 *   - Shift+Enter:     insert '\n' (only distinguishable when the kitty
 *                      keyboard protocol is active — see index.tsx)
 *   - Option/Alt+Enter,
 *     Ctrl+J:          insert '\n' — terminal-independent fallbacks for
 *                      terminals that cannot report Shift+Enter
 *   - Up / Down:       move the cursor one *visual line*, keeping the
 *                      visual column where possible. No-op at edges.
 *   - Left / Right:    one codepoint
 *   - Home / End:      start / end of the current *logical* line
 *   - Ctrl+A / Ctrl+E: start / end of the whole value
 *   - Ctrl+K:          delete from cursor to end of logical line
 *   - Ctrl+U:          delete from cursor to start of logical line
 *   - Backspace:       delete one codepoint before cursor
 *   - Delete:          delete one codepoint at cursor
 *   - any other input: insert at cursor
 *
 * Cursor positions are computed against `textLayout`, an offset-exact
 * visual layout, so the cursor never drifts on wrapped or multi-line
 * text. The renderer paints the same layout, so what is shown and where
 * the cursor sits always agree.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { visibleWidth } from '../glyphs.js';
import { layoutVisualLines, offsetToRowCol, rowColToOffset } from './textLayout.js';
import { useTheme } from '../theme.js';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  /** Visual column budget. The cursor + rendered lines fit inside. */
  width: number;
  /** Placeholder when value is empty. */
  placeholder?: string;
}

function toCodePoints(s: string): string[] {
  return Array.from(s);
}

export function MultiLineTextInput({ value, onChange, onSubmit, width, placeholder }: Props) {
  const { colors: c } = useTheme();
  const [offset, setOffset] = useState(() => value.length);

  // Keep offset in range if value is externally replaced.
  useEffect(() => {
    if (offset > value.length) setOffset(value.length);
  }, [value.length, offset]);

  // Reserve the cursor's own column from the wrap budget.
  const renderWidth = Math.max(1, width - 1);
  const isPlaceholder = value.length === 0 && !!placeholder;

  const layout = useMemo(() => layoutVisualLines(value, renderWidth), [value, renderWidth]);
  const cursorPos = useMemo(
    () => (isPlaceholder ? { row: 0, col: 0 } : offsetToRowCol(value, layout, offset)),
    [value, layout, offset, isPlaceholder],
  );

  const insertNewline = () => {
    const next = value.slice(0, offset) + '\n' + value.slice(offset);
    onChange(next);
    setOffset(offset + 1);
  };

  useInput((input, key) => {
    // Submit on bare Enter. Newline on Shift+Enter (kitty), Option/Alt+Enter
    // (meta), or Ctrl+J (which arrives as input '\n' with key.return unset).
    if (key.return) {
      if (key.shift || key.meta) { insertNewline(); return; }
      onSubmit(value);
      return;
    }
    if (input === '\n') { insertNewline(); return; }

    if (key.escape) {
      // Escape is owned by SessionEditor (cancel). Don't swallow it.
      return;
    }

    // ── Vertical cursor movement ─────────────────────────────────────
    if (key.upArrow) {
      if (isPlaceholder || cursorPos.row === 0) return;
      setOffset(rowColToOffset(value, layout, cursorPos.row - 1, cursorPos.col));
      return;
    }
    if (key.downArrow) {
      if (isPlaceholder || cursorPos.row >= layout.length - 1) return;
      setOffset(rowColToOffset(value, layout, cursorPos.row + 1, cursorPos.col));
      return;
    }

    // ── Horizontal cursor movement ───────────────────────────────────
    if (key.leftArrow) {
      if (offset === 0) return;
      const cps = toCodePoints(value.slice(0, offset));
      setOffset(offset - cps[cps.length - 1].length);
      return;
    }
    if (key.rightArrow) {
      if (offset >= value.length) return;
      const cps = toCodePoints(value.slice(offset));
      setOffset(offset + cps[0].length);
      return;
    }
    if (key.home) {
      setOffset(startOfLogicalLine(value, offset));
      return;
    }
    if (key.end) {
      setOffset(endOfLogicalLine(value, offset));
      return;
    }

    if (key.ctrl && (input === 'a' || input === 'A')) {
      setOffset(0);
      return;
    }
    if (key.ctrl && (input === 'e' || input === 'E')) {
      setOffset(value.length);
      return;
    }
    if (key.ctrl && (input === 'k' || input === 'K')) {
      const end = endOfLogicalLine(value, offset);
      if (end === offset) return;
      onChange(value.slice(0, offset) + value.slice(end));
      return;
    }
    if (key.ctrl && (input === 'u' || input === 'U')) {
      const start = startOfLogicalLine(value, offset);
      if (start === offset) return;
      onChange(value.slice(0, start) + value.slice(offset));
      setOffset(start);
      return;
    }

    // ── Deletion ─────────────────────────────────────────────────────
    if (key.backspace) {
      if (offset === 0) return;
      const cps = toCodePoints(value.slice(0, offset));
      const removed = cps[cps.length - 1];
      const newOffset = offset - removed.length;
      onChange(value.slice(0, newOffset) + value.slice(offset));
      setOffset(newOffset);
      return;
    }
    if (key.delete) {
      if (offset >= value.length) return;
      const cps = toCodePoints(value.slice(offset));
      onChange(value.slice(0, offset) + value.slice(offset + cps[0].length));
      return;
    }

    // ── Plain insertion ──────────────────────────────────────────────
    // Skip control keys and stray CR/LF (handled above).
    if (input && !key.ctrl && !key.meta && input !== '\r' && input !== '\n') {
      onChange(value.slice(0, offset) + input + value.slice(offset));
      setOffset(offset + input.length);
    }
  });

  // --- render ---------------------------------------------------------------
  if (isPlaceholder) {
    return (
      <Box flexDirection="column">
        <Text>
          <Text inverse>{' '}</Text>
          <Text color={c.inactive} dimColor>{placeholder}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {layout.map((ln, i) => {
        const text = value.slice(ln.start, ln.end);
        if (i !== cursorPos.row) {
          return <Text key={i}>{text || ' '}</Text>;
        }
        // Active line: split at the cursor column to invert one cell.
        const before = sliceAtVisualCol(text, cursorPos.col);
        const cursorCh = charAtVisualCol(text, cursorPos.col);
        const after = text.slice(before.length + cursorCh.length);
        return (
          <Text key={i}>
            <Text>{before}</Text>
            {cursorCh
              ? <Text inverse color={c.text}>{cursorCh}</Text>
              : <Text inverse>{' '}</Text>}
            <Text>{after}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

function startOfLogicalLine(value: string, offset: number): number {
  const idx = value.slice(0, offset).lastIndexOf('\n');
  return idx < 0 ? 0 : idx + 1;
}

function endOfLogicalLine(value: string, offset: number): number {
  const idx = value.indexOf('\n', offset);
  return idx < 0 ? value.length : idx;
}

/** Substring of `line` up to (not including) the char at visual `col`. */
function sliceAtVisualCol(line: string, col: number): string {
  let walked = 0;
  let i = 0;
  for (const ch of line) {
    const cw = visibleWidth(ch);
    if (walked + cw > col) break;
    walked += cw;
    i += ch.length;
  }
  return line.slice(0, i);
}

function charAtVisualCol(line: string, col: number): string {
  let walked = 0;
  for (const ch of line) {
    const cw = visibleWidth(ch);
    if (walked === col) return ch;
    if (walked + cw > col) return '';
    walked += cw;
  }
  return '';
}
