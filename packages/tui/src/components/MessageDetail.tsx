/**
 * MessageDetail — full content of a single message, with a
 * diff-style view of each tool call's input and result. Shown
 * as a Pane below the message list; Esc returns to the list.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { MessageNode, ToolCallInfo } from '@ccedit/core';
import { Header } from './Chrome.js';
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js';
import { Byline } from './Byline.js';
import { useTheme } from '../theme.js';
import { G, truncate, flatten, padEnd } from '../glyphs.js';

interface Props {
  message: MessageNode;
  messages: MessageNode[];
  width: number;
}

function formatTime(ts?: string): string {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? (ts ?? 'N/A') : d.toLocaleString();
}

function ToolCallBlock({
  tc, idx, allMessages, width, c,
}: {
  tc: ToolCallInfo;
  idx: number;
  allMessages: MessageNode[];
  width: number;
  c: ReturnType<typeof useTheme>['colors'];
}) {
  const result = tc.resultIndex !== null ? allMessages[tc.resultIndex] : null;
  const ok = tc.resultOk;
  const sideEffect = tc.sideEffect !== 'none';
  const status = ok === null ? '—' : ok ? `${G.tick} ok` : `${G.cross} fail`;
  const statusColor = ok === null ? c.inactive : ok ? c.success : c.error;

  return (
    <Box key={tc.toolUseId} flexDirection="column" paddingX={1} marginTop={1}>
      <Box>
        <Text color={c.inactive}>{String(idx + 1).padStart(2, ' ')}.</Text>
        <Text> </Text>
        <Text bold color={c.accent}>{tc.toolName}</Text>
        <Text>  </Text>
        <Text color={statusColor}>{status}</Text>
        {sideEffect && <Text color={c.warning}>  {G.warning} {tc.sideEffect}</Text>}
      </Box>

      {tc.affectedFile && (
        <Box paddingLeft={4}>
          <Text color={c.inactive}>file </Text>
          <Text color={c.text}>{tc.affectedFile}</Text>
        </Box>
      )}

      {Object.keys(tc.input).length > 0 && (
        <Box flexDirection="column" paddingLeft={4}>
          <Text color={c.inactive} dimColor>input</Text>
          {Object.entries(tc.input).map(([k, v]) => {
            const value = typeof v === 'string' ? flatten(v) : JSON.stringify(v);
            return (
              <Box key={k}>
                <Text color={c.inactive}>{padEnd(k, 12)}</Text>
                <Text> </Text>
                <Text color={c.text}>{truncate(value, Math.max(20, width - 22))}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {result && (
        <Box flexDirection="column" paddingLeft={4}>
          <Text color={c.inactive} dimColor>result</Text>
          <Box paddingLeft={2}>
            <Text color={c.text}>{truncate(flatten(tc.resultContent || ''), Math.max(20, width - 8))}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function MessageDetail({ message, messages, width }: Props) {
  const { colors: c } = useTheme();
  const tcCount = message.toolCalls.length;
  const title = `Message L${message.index + 1} · ${message.role}`;

  return (
    <Box flexDirection="column">
      <Header
        title={title}
        subtitle={`${message.type} · ${messages.length} total`}
        right={
          tcCount > 0
            ? <Text color={c.inactive}>{tcCount} tool call{tcCount === 1 ? '' : 's'}</Text>
            : undefined
        }
        width={width}
      />

      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box>
          <Text color={c.inactive}>uuid     </Text>
          <Text color={c.text}>{message.uuid}</Text>
        </Box>
        <Box>
          <Text color={c.inactive}>parent   </Text>
          <Text color={c.text}>{message.parentUuid ?? '—'}</Text>
        </Box>
        <Box>
          <Text color={c.inactive}>time     </Text>
          <Text color={c.text}>{formatTime(message.timestamp)}</Text>
        </Box>
        {message.hasSideEffects && (
          <Box>
            <Text color={c.warning} bold>{G.warning} this message has side effects</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text color={c.inactive} dimColor>content</Text>
        <Box paddingLeft={2} flexDirection="column">
          {(message.textContent || '(empty)').split('\n').map((line, i) => (
            <Text key={i} color={c.text}>{line || ' '}</Text>
          ))}
        </Box>
      </Box>

      {tcCount > 0 && (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text color={c.inactive} dimColor>tool calls</Text>
          {message.toolCalls.map((tc, i) => (
            <ToolCallBlock key={tc.toolUseId} tc={tc} idx={i} allMessages={messages} width={width} c={c} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Byline dim>
          <KeyboardShortcutHint shortcut="esc" action="back to list" />
          <KeyboardShortcutHint shortcut="e" action="edit content" />
          <KeyboardShortcutHint shortcut="d" action="delete" />
        </Byline>
      </Box>
    </Box>
  );
}
