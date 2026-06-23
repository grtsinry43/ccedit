/**
 * Divider — a horizontal rule that can carry a centred title.
 * Cloned from cc's `<Divider>` (which itself is used by `<Pane>`).
 * Avoids Ink's box-drawing border, which paints dimly and adds
 * vertical padding we don't want in a vertical scroll.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { G, visibleWidth } from '../glyphs.js';

interface DividerProps {
  width: number;
  title?: string;
}

export function Divider({ width, title }: DividerProps) {
  const c = colors();
  if (!title) {
    return (
      <Text color={c.subtle}>{G.dash.repeat(Math.max(0, width))}</Text>
    );
  }
  const titleText = ` ${title} `;
  const titleW = visibleWidth(titleText);
  const sideW = Math.max(0, width - titleW);
  const leftW = Math.floor(sideW / 2);
  const rightW = sideW - leftW;
  return (
    <Text>
      <Text color={c.subtle}>{G.dash.repeat(leftW)}</Text>
      <Text color={c.inactive}>{titleText}</Text>
      <Text color={c.subtle}>{G.dash.repeat(rightW)}</Text>
    </Text>
  );
}
