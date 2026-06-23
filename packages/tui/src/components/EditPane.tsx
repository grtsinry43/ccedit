/**
 * EditPane — inline editor for a single message's text content.
 * Uses MultiLineTextInput so the user can write multi-line prompts
 * and move the cursor with ↑↓ — same affordances as cc.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Chrome.js';
import { Byline } from './Byline.js';
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js';
import { useTheme } from '../theme.js';
import { G, truncate } from '../glyphs.js';
import { MultiLineTextInput } from './MultiLineTextInput.js';

interface Props {
  indexLabel: string;
  initialValue: string;
  width: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function EditPane({ indexLabel, initialValue, width, onSubmit, onCancel }: Props) {
  const { colors: c } = useTheme();
  const [value, setValue] = React.useState(initialValue);
  // Reserve 2 columns for the prompt glyph + a space.
  const inputWidth = Math.max(20, width - 4);
  const lineCount = value.split('\n').length;

  return (
    <Box flexDirection="column">
      <Header
        title={`Edit ${indexLabel}`}
        subtitle="type to replace the message content"
        right={
          <Text color={c.inactive}>
            {value.length} chars · {lineCount} line{lineCount === 1 ? '' : 's'}
          </Text>
        }
        width={width}
      />
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box>
          <Text color={c.accent}>{G.prompt} </Text>
          <Box flexDirection="column" width={inputWidth}>
            <MultiLineTextInput
              value={value}
              onChange={setValue}
              onSubmit={onSubmit}
              width={inputWidth}
              placeholder="type the new message…"
            />
          </Box>
        </Box>
        <Box paddingTop={1}>
          <Text color={c.inactive} dimColor>{truncate(initialValue, Math.max(40, width - 4))}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Byline>
          <KeyboardShortcutHint shortcut="enter" action="save" />
          <Text color={c.inactive}>⇧⏎/⌥⏎/^J newline</Text>
          <Text color={c.inactive}>↑↓ cursor</Text>
          <KeyboardShortcutHint shortcut="esc" action="cancel" />
        </Byline>
      </Box>
    </Box>
  );
}
