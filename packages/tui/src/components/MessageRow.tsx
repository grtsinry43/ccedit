/**
 * MessageRow — one message in the editor list.
 *
 * Visual states are derived from the `MessageNode.kind` field:
 *
 *   ❯ L001 › user          my prompt text here…          ⚠ ✎   14:32
 *   • L002 asst[2]         read & wrote two files        ✎      14:32
 *   ↳ L003 ↳ result         ok                             -      14:32
 *   ⏏ L004 ⏏ meta          [Last Prompt]                  -      -
 *   § L005 § compact         12 messages compacted         -      -
 *   ⌘ L006 ⌘ sidechain      review the Login.tsx file     -      -
 *
 * - ❯ pointer (suggestion color) when focused
 * - L###  index
 * - role glyph + name
 * - text preview (truncated to fit)
 * - ⚠ side-effect marker, ✎ edit marker
 * - timestamp
 *
 * No background colors — they shift column widths across terminals.
 * Hard-block kinds render the same shape but in dim color and never
 * show a check column.
 */
import React from 'react';
import { Text } from 'ink';
import { MessageNode, type MessageKind } from '@ccedit/core';
import { G, truncate, padEnd } from '../glyphs.js';
import { colors } from '../theme.js';

interface Props {
  message: MessageNode;
  isFocused: boolean;
  isSelected: boolean;
  textWidth: number;
  hasEdits?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface KindStyle {
  glyph: string;
  label: string;
  color: (c: ReturnType<typeof colors>) => string;
}

const ROLE_GLYPH: Record<MessageKind, [string, string]> = {
  'human': [G.user, 'user'],
  'assistant-text': [G.assistant, 'asst'],
  'assistant-with-tools': [G.tool, 'asst+'],
  'tool-result': [G.pair, 'result'],
  'meta-injection': ['◇', 'meta'],
  'system': ['◇', 'sys'],
  'compact-boundary': [G.section, 'compact'],
  'attachment': ['◇', 'attach'],
  'progress': [G.spin, 'live'],
  'sidechain-human': [G.chain, 'side'],
  'sidechain-assistant': [G.chain, 'side+'],
  'metadata': [G.lock, 'meta'],
};

const KIND_COLOR: Record<MessageKind, (c: ReturnType<typeof colors>) => string> = {
  'human': c => c.success,
  'assistant-text': c => c.accent,
  'assistant-with-tools': c => c.accent,
  'tool-result': c => c.inactive,
  'meta-injection': c => c.inactive,
  'system': c => c.warning,
  'compact-boundary': c => c.suggestion,
  'attachment': c => c.inactive,
  'progress': c => c.inactive,
  'sidechain-human': c => c.inactive,
  'sidechain-assistant': c => c.inactive,
  'metadata': c => c.inactive,
};

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const HARD_BLOCK_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'metadata', 'progress', 'attachment', 'system', 'compact-boundary',
  'meta-injection', 'sidechain-human', 'sidechain-assistant',
]);

export function MessageRow({
  message, isFocused, isSelected, textWidth, hasEdits, isExpanded, onToggleExpand,
}: Props) {
  const c = colors();
  const [glyph, label] = ROLE_GLYPH[message.kind];
  const kindColor = KIND_COLOR[message.kind](c);
  const isHardBlock = HARD_BLOCK_KINDS.has(message.kind);

  const preview = message.textContent || `(${message.type})`;
  const idxLabel = `L${String(message.index + 1).padStart(3, '0')}`;
  const toolCount = message.toolCalls.length;

  const idxColor = isFocused ? c.accent : c.inactive;
  const previewColor = isFocused ? c.text : c.inactive;

  // Hard-block kinds: no check column, dim everything. Sidechain gets
  // a fold indicator instead of a check so the user can expand.
  return (
    <Text>
      <Text color={isFocused ? c.suggestion : c.inactive} bold={isFocused}>
        {isFocused ? G.pointer : ' '}{' '}
      </Text>
      {isHardBlock ? (
        isFocused && (message.kind === 'sidechain-human' || message.kind === 'sidechain-assistant') ? (
          <Text color={c.accent}>{isExpanded ? G.arrowDown : G.arrowRight} </Text>
        ) : (
          <Text>  </Text>
        )
      ) : isSelected ? (
        <Text color={c.success}>{G.tick} </Text>
      ) : (
        <Text>  </Text>
      )}
      <Text color={idxColor} bold={isFocused}>{idxLabel}</Text>
      <Text>  </Text>
      <Text color={kindColor}>{glyph} {padEnd(label, 4)}</Text>
      {toolCount > 0 && (
        <Text color={c.inactive}> [{toolCount}]</Text>
      )}
      <Text>  </Text>
      <Text color={previewColor}>{truncate(preview, textWidth)}</Text>
      {message.imageCount > 0 && (
        <Text color={c.warning}> {G.image}{message.imageCount > 1 ? `×${message.imageCount}` : ''}</Text>
      )}
      {message.hasSideEffects && <Text color={c.warning}> {G.warning}</Text>}
      {hasEdits && <Text color={c.suggestion}> ✎</Text>}
      {message.isOrphan && <Text color={c.error}> {G.cross}</Text>}
      <Text>  </Text>
      <Text color={c.inactive} dimColor>{formatTime(message.timestamp)}</Text>
    </Text>
  );
}
