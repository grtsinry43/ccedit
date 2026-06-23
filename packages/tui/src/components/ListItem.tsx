/**
 * ListItem — a single row in a selection list. Shows a pointer
 * glyph in the focused column, an optional checkmark on the right,
 * and applies semantic colour to its children. Adapted from cc's
 * <ListItem> with a slimmer prop set suited to ccedit.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { G } from '../glyphs.js';

interface ListItemProps {
  isFocused: boolean;
  isSelected?: boolean;
  /** Show a "more above" indicator instead of a pointer (first visible row). */
  showScrollUp?: boolean;
  /** Show a "more below" indicator instead of a pointer (last visible row). */
  showScrollDown?: boolean;
  /** Render children as raw — caller handles its own colour/styling. */
  children: React.ReactNode;
  /** Optional description rendered below the main row, dimmed. */
  description?: React.ReactNode;
}

export function ListItem({
  isFocused,
  isSelected = false,
  showScrollUp = false,
  showScrollDown = false,
  children,
  description,
}: ListItemProps) {
  const c = colors();
  const indicatorColor = isFocused ? c.suggestion : c.inactive;
  const indicator =
    isFocused ? (
      <Text color={indicatorColor} bold>{G.pointer}</Text>
    ) : showScrollUp ? (
      <Text color={c.inactive}>{G.arrowUp}</Text>
    ) : showScrollDown ? (
      <Text color={c.inactive}>{G.arrowDown}</Text>
    ) : (
      <Text> </Text>
    );
  const tick = isSelected ? <Text color={c.success}>{G.tick}</Text> : <Text> </Text>;
  // Focused items get a brighter colour treatment but never a background
  // — backgrounds on list rows break column alignment in most terminals.
  const rowColor = isSelected ? c.success : isFocused ? c.text : c.inactive;
  return (
    <Box flexDirection="column">
      <Box>
        {indicator}
        <Text> </Text>
        <Text color={rowColor} bold={isFocused}>{children}</Text>
        <Text> </Text>
        {tick}
      </Box>
      {description && (
        <Box paddingLeft={2}>
          <Text color={c.inactive} dimColor>{description}</Text>
        </Box>
      )}
    </Box>
  );
}
