/**
 * MessageList — virtualised scrollable list of message rows with
 * cc-style section markers for compact boundaries.
 *
 * Sidechain folding: contiguous sidechain messages collapse into a
 * single "sidechain" group row. Enter on a focused group expands it
 * inline; the inner rows use dim color and indent. The fold state
 * is owned by the parent so it survives scroll position changes.
 *
 * The list does NOT own keyboard input — the parent passes the
 * focused index down and dispatches ↑/↓/Space/Enter accordingly.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { MessageNode, type MessageKind } from '@ccedit/core';
import { MessageRow } from './MessageRow.js';
import { colors } from '../theme.js';
import { G } from '../glyphs.js';

type ListEntry =
  | { kind: 'message'; node: MessageNode; lineIndex: number }
  | { kind: 'group'; children: MessageNode[]; lineIndex: number; agentId?: string }
  | { kind: 'section'; node: MessageNode; lineIndex: number };

interface Props {
  messages: MessageNode[];
  focusedIndex: number;
  selectedIds: Set<string>;
  editedIds: Set<string>;
  width: number;
  height: number;
  expandedGroups: Set<number>;  // indexes of the first line of an expanded group
}

const SIDECHAIN_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'sidechain-human', 'sidechain-assistant',
]);

function collapse(messages: MessageNode[]): ListEntry[] {
  const out: ListEntry[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.kind === 'compact-boundary') {
      out.push({ kind: 'section', node: m, lineIndex: out.length });
      i++;
      continue;
    }
    if (SIDECHAIN_KINDS.has(m.kind)) {
      const startAgent = (m.raw as { agentId?: string }).agentId;
      const group: MessageNode[] = [m];
      let j = i + 1;
      while (j < messages.length
        && SIDECHAIN_KINDS.has(messages[j].kind)
        && (messages[j].raw as { agentId?: string }).agentId === startAgent) {
        group.push(messages[j]);
        j++;
      }
      out.push({ kind: 'group', children: group, lineIndex: out.length, agentId: startAgent });
      i = j;
      continue;
    }
    out.push({ kind: 'message', node: m, lineIndex: out.length });
    i++;
  }
  return out;
}

export function MessageList({
  messages, focusedIndex, selectedIds, editedIds, width, height, expandedGroups,
}: Props) {
  const c = colors();
  const fixedWidth = 2 + 2 + 5 + 2 + 6 + 2 + 6 + 2;
  const previewWidth = Math.max(20, width - fixedWidth - 2);

  const entries = useMemo(() => collapse(messages), [messages]);
  const visibleHeight = Math.max(3, height);
  const scrollOffset = useMemo(() => {
    if (focusedIndex < visibleHeight) return 0;
    return Math.min(
      focusedIndex - Math.floor(visibleHeight / 2),
      Math.max(0, entries.length - visibleHeight),
    );
  }, [focusedIndex, visibleHeight, entries.length]);

  const window = entries.slice(scrollOffset, scrollOffset + visibleHeight);
  const atTop = scrollOffset === 0;
  const atBottom = scrollOffset + visibleHeight >= entries.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      {!atTop && (
        <Text color={c.inactive} dimColor>
          {'  '}{G.arrowUp} {scrollOffset} more above
        </Text>
      )}
      {window.map((entry, i) => {
        const actualIndex = scrollOffset + i;
        const isFocused = actualIndex === focusedIndex;

        if (entry.kind === 'section') {
          return <SectionRow key={`s-${entry.node.uuid}-${actualIndex}`} node={entry.node} width={width} />;
        }

        if (entry.kind === 'group') {
          const isExpanded = expandedGroups.has(actualIndex);
          return (
            <GroupRow
              key={`g-${actualIndex}`}
              children={entry.children}
              agentId={entry.agentId}
              isFocused={isFocused}
              isExpanded={isExpanded}
              width={width}
            />
          );
        }

        return (
          <MessageRow
            key={entry.node.uuid}
            message={entry.node}
            isFocused={isFocused}
            isSelected={selectedIds.has(entry.node.uuid)}
            hasEdits={editedIds.has(entry.node.uuid)}
            textWidth={previewWidth}
          />
        );
      })}
      {!atBottom && (
        <Text color={c.inactive} dimColor>
          {'  '}{G.arrowDown} {entries.length - scrollOffset - visibleHeight} more below
        </Text>
      )}
    </Box>
  );
}

function SectionRow({ node, width }: { node: MessageNode; width: number }) {
  const c = colors();
  const label = node.textContent || 'compact boundary';
  const side = G.dash.repeat(2);
  return (
    <Box flexDirection="row" paddingY={1}>
      <Text color={c.suggestion}>
        {'  '}{G.section} {side} {label} {side}
      </Text>
    </Box>
  );
}

function GroupRow({
  children, agentId, isFocused, isExpanded, width,
}: { children: MessageNode[]; agentId?: string; isFocused: boolean; isExpanded: boolean; width: number }) {
  const c = colors();
  const label = agentId ? `sidechain ${agentId}` : 'sidechain';
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isFocused ? c.suggestion : c.inactive} bold={isFocused}>
          {isFocused ? G.pointer : ' '}{' '}
        </Text>
        <Text color={isFocused ? c.suggestion : c.inactive}>{isExpanded ? G.arrowDown : G.arrowRight} </Text>
        <Text color={c.inactive} bold={isFocused}>{G.chain} {label}</Text>
        <Text color={c.inactive}> · {children.length} message{children.length === 1 ? '' : 's'}</Text>
      </Box>
      {isExpanded && children.map((m, i) => (
        <Box key={m.uuid} paddingLeft={6}>
          <Text color={c.inactive} dimColor>
            {`${String(i + 1).padStart(2, ' ')}. `}
            {m.textContent || `(${m.type})`}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
