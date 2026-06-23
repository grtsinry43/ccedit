/**
 * ConfirmDialog — modal-style confirm for destructive actions.
 * Painted as a Pane so it sits in the screen flow without the
 * double-border legacy box.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { Pane } from './Pane.js';
import { Byline } from './Byline.js';
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js';
import { useTheme } from '../theme.js';
import { G, truncate } from '../glyphs.js';

interface Props {
  message: string;
  affectedFiles?: string[];
  sideEffectCount?: number;
  width: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  message, affectedFiles = [], sideEffectCount = 0, width, onConfirm, onCancel,
}: Props) {
  const { colors: c } = useTheme();

  return (
    <Box flexDirection="column">
      <Pane width={width} accent={c.warning}>
        <Box>
          <Text color={c.warning} bold>{G.warning} confirm deletion</Text>
        </Box>
        <Box paddingTop={1}>
          <Text color={c.text}>{message}</Text>
        </Box>

        {sideEffectCount > 0 && (
          <Box flexDirection="column" paddingTop={1}>
            <Text color={c.warning} bold>
              {G.warning} {sideEffectCount} of these have side effects
            </Text>
            <Text color={c.inactive}>
              Deleting them will NOT revert the file changes on disk.
            </Text>
          </Box>
        )}

        {affectedFiles.length > 0 && (
          <Box flexDirection="column" paddingTop={1}>
            <Text color={c.inactive} dimColor>affected files</Text>
            {affectedFiles.slice(0, 6).map((f, i) => (
              <Box key={i} paddingLeft={2}>
                <Text color={c.accent}>{G.bullet} </Text>
                <Text color={c.text}>{truncate(f, Math.max(20, width - 8))}</Text>
              </Box>
            ))}
            {affectedFiles.length > 6 && (
              <Box paddingLeft={2}>
                <Text color={c.inactive}>…and {affectedFiles.length - 6} more</Text>
              </Box>
            )}
          </Box>
        )}

        <Box paddingTop={1}>
          <Byline>
            <Text color={c.success} bold>Y</Text>
            <Text> confirm</Text>
            <Text color={c.error} bold>N</Text>
            <Text> cancel</Text>
            <Text color={c.inactive} bold>esc</Text>
            <Text> cancel</Text>
          </Byline>
        </Box>
      </Pane>
    </Box>
  );
}
