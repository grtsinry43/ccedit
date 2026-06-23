/**
 * KeyboardShortcutHint — renders "Enter to confirm" / "(esc to cancel)".
 * Mirrors cc's <KeyboardShortcutHint> API: bold the key, plain the verb.
 */
import React from 'react';
import { Text } from 'ink';

interface HintProps {
  shortcut: string;
  action: string;
  parens?: boolean;
  boldKey?: boolean;
}

export function KeyboardShortcutHint({ shortcut, action, parens = false, boldKey = true }: HintProps) {
  const inner = (
    <>
      {boldKey ? <Text bold>{shortcut}</Text> : shortcut}
      {' to '}{action}
    </>
  );
  return parens ? <Text>({inner})</Text> : <Text>{inner}</Text>;
}
