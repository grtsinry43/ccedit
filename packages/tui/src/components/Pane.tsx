/**
 * Pane — a region bounded by a coloured top divider with horizontal
 * padding. Use this for sub-screens inside the editor (e.g. the
 * message detail view, the confirm dialog). Pattern lifted from
 * cc's <Pane>.
 */
import React from 'react';
import { Box } from 'ink';
import { useTheme } from '../theme.js';
import { Divider } from './Divider.js';

interface PaneProps {
  width: number;
  /** Theme color key (or any hex) for the top divider. */
  accent?: string;
  children: React.ReactNode;
}

export function Pane({ width, accent, children }: PaneProps) {
  const { colors: c } = useTheme();
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Divider width={width} title="" />
      <Box flexDirection="column" paddingX={1}>
        {children}
      </Box>
    </Box>
  );
}
