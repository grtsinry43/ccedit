/**
 * SessionSelector — pick a session file for the current project.
 * Search is incremental: type `/` to focus the search box, type to
 * filter, Esc to clear and refocus the list.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { Header, Footer } from './Chrome.js';
import { ListItem } from './ListItem.js';
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js';
import { useTheme } from '../theme.js';
import { G, flatten, truncate, padEnd, visibleWidth } from '../glyphs.js';
import { getProjectSessionDir } from '@ccedit/shared';

export interface Session {
  id: string;
  filePath: string;
  messageCount: number;
  lastModified: Date;
  size: number;
}

interface Props {
  projectPath: string;
  onSelect: (session: Session) => void;
  onQuit: () => void;
}

function formatDate(d: Date) {
  return d.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SessionSelector({ projectPath, onSelect, onQuit }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const { colors: c } = useTheme();
  const width = process.stdout.columns || 100;

  useEffect(() => {
    try {
      const projectDir = getProjectSessionDir(projectPath);
      if (!fs.existsSync(projectDir)) {
        setError(`No sessions found for project: ${projectPath}`);
        setLoading(false);
        return;
      }
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const filePath = path.join(projectDir, f);
          const stat = fs.statSync(filePath);
          return {
            id: f.replace('.jsonl', ''),
            filePath,
            messageCount: 0, // populated lazily below
            lastModified: stat.mtime,
            size: stat.size,
          };
        })
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      setSessions(files);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      setLoading(false);
    }
  }, [projectPath]);

  const filtered = useMemo(() => {
    if (!query) return sessions;
    const q = query.toLowerCase();
    return sessions.filter(s => s.id.toLowerCase().includes(q));
  }, [sessions, query]);

  useInput((input, key) => {
    if (searching) {
      if (key.escape) {
        setQuery('');
        setSearching(false);
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery(q => q.slice(0, -1));
        setFocused(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setQuery(q => q + input);
        setFocused(0);
      }
      return;
    }

    if (key.upArrow) {
      setFocused(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setFocused(i => Math.min(filtered.length - 1, i + 1));
    } else if (key.return) {
      if (filtered[focused]) onSelect(filtered[focused]);
    } else if (input === '/') {
      setSearching(true);
    } else if (input === 'q' || input === 'Q' || key.escape) {
      onQuit();
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title="ccedit" subtitle={projectPath} width={width} />
        <Box paddingX={1} paddingTop={1}>
          <Text color={c.warning}>Loading sessions…</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title="ccedit" subtitle={projectPath} width={width} />
        <Box paddingX={1} paddingTop={1} flexDirection="column">
          <Text color={c.error}>{error}</Text>
          <Text color={c.inactive}>Use {G.prompt}cd into a Claude project or pass -p /path/to/project.</Text>
        </Box>
        <Footer width={width} hints={[
          <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />
        ]} />
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title="ccedit" subtitle={projectPath} width={width} />
        <Box paddingX={1} paddingTop={1} flexDirection="column">
          <Text color={c.warning}>No sessions found for this project.</Text>
          <Text color={c.inactive}>Start a conversation in Claude Code first.</Text>
        </Box>
        <Footer width={width} hints={[
          <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />
        ]} />
      </Box>
    );
  }

  // Column layout: idx(4) id(10) msgs(8) size(8) date(13) — gaps of 1.
  const idCol = 10;
  const msgsCol = 8;
  const sizeCol = 8;
  const dateCol = 17;
  const headerRow =
    padEnd('#', 4) +
    ' ' + padEnd('SESSION', idCol) +
    ' ' + padEnd('MSGS', msgsCol) +
    ' ' + padEnd('SIZE', sizeCol) +
    ' ' + padEnd('MODIFIED', dateCol);

  // Reserve rows for header, footer, padding.
  const rows = process.stdout.rows || 24;
  const visibleHeight = Math.max(5, rows - 10);
  const scrollOffset = Math.max(0, Math.min(
    focused - Math.floor(visibleHeight / 2),
    Math.max(0, filtered.length - visibleHeight),
  ));
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleHeight);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        title="ccedit · sessions"
        subtitle={projectPath}
        right={
          <Text color={c.inactive}>
            {query ? `${filtered.length}/${sessions.length} matching` : `${sessions.length} sessions`}
          </Text>
        }
        width={width}
      />

      {searching && (
        <Box paddingX={1}>
          <Text color={c.accent} bold>{G.search} </Text>
          <Text>{query}</Text>
          <Text color={c.inactive}>{G.prompt}</Text>
        </Box>
      )}

      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text color={c.inactive} dimColor>{headerRow}</Text>
        {visible.map((s, i) => {
          const idx = scrollOffset + i + 1;
          const isFocused = idx - 1 === focused;
          const showUp = i === 0 && scrollOffset > 0;
          const showDown = i === visible.length - 1 && scrollOffset + visibleHeight < filtered.length;
          return (
            <ListItem
              key={s.id}
              isFocused={isFocused}
              showScrollUp={showUp}
              showScrollDown={showDown}
            >
              <Text>
                {padEnd(String(idx), 3)}{' '}
                <Text color={isFocused ? c.accent : c.inactive}>
                  {padEnd(s.id.slice(0, idCol), idCol)}
                </Text>{' '}
                <Text color={isFocused ? c.text : c.inactive}>
                  {padEnd('—', msgsCol)}
                </Text>{' '}
                <Text color={c.inactive}>
                  {padEnd(formatSize(s.size), sizeCol)}
                </Text>{' '}
                <Text color={c.inactive}>
                  {formatDate(s.lastModified)}
                </Text>
              </Text>
            </ListItem>
          );
        })}
      </Box>

      <Footer
        width={width}
        hints={searching ? [
          <KeyboardShortcutHint key="esc" shortcut="esc" action="clear" />,
          <KeyboardShortcutHint key="ret" shortcut="enter" action="back to list" />,
        ] : [
          <KeyboardShortcutHint key="nav" shortcut="↑↓" action="navigate" />,
          <KeyboardShortcutHint key="open" shortcut="enter" action="open" />,
          <KeyboardShortcutHint key="search" shortcut="/" action="search" />,
          <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />,
        ]}
        status={
          filtered.length > 0
            ? <Text>{focused + 1}/{visibleWidth(String(filtered.length)) ? filtered.length : filtered.length}</Text>
            : undefined
        }
      />
    </Box>
  );
}
