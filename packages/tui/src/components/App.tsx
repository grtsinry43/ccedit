/**
 * App — top-level state machine: 'selector' (pick a session) or
 * 'editor' (edit messages). On `repair`, repairs the chain before
 * handing off to the editor.
 */
import React, { useState } from 'react';
import { Box, useApp } from 'ink';
import { parseJsonlFile, saveSession, repairMessageChain, MessageNode } from '@ccedit/core';
import { getProjectSessionDir } from '@ccedit/shared';
import SessionSelector, { Session } from './SessionSelector.js';
import SessionEditor from './SessionEditor.js';

interface Props {
  initialProjectPath?: string;
  initialSessionId?: string;
  repair?: boolean;
}

export default function App({ initialProjectPath, initialSessionId, repair = false }: Props) {
  const { exit } = useApp();
  const projectPath = initialProjectPath || process.cwd();

  const [view, setView] = useState<'selector' | 'editor'>(initialSessionId ? 'editor' : 'selector');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<MessageNode[]>([]);

  const loadMessages = (filePath: string): MessageNode[] | null => {
    try {
      let parsed = parseJsonlFile(filePath);
      if (repair) {
        const r = repairMessageChain(parsed);
        parsed = r.messages;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  };

  React.useEffect(() => {
    if (!initialSessionId) return;
    const filePath = `${getProjectSessionDir(projectPath)}/${initialSessionId}.jsonl`;
    const msgs = loadMessages(filePath);
    if (!msgs) { exit(); return; }
    setMessages(msgs);
    setSelectedSession({
      id: initialSessionId,
      filePath,
      messageCount: msgs.length,
      lastModified: new Date(),
      size: 0,
    });
  }, []);

  const handleSessionSelect = (s: Session) => {
    const msgs = loadMessages(s.filePath);
    if (!msgs) return;
    setMessages(msgs);
    setSelectedSession(s);
    setView('editor');
  };

  const handleSave = (edited: MessageNode[]) => {
    if (!selectedSession) return;
    try {
      const result = saveSession(selectedSession.filePath, edited, {
        createBackup: true,
        preserveMetadata: true,
      });
      // Best-effort console summary; in TUI this is mostly invisible but
      // useful when piped. Could be wired to a toast later.
      process.stderr.write(
        `\nsaved ${edited.length} messages${result.backupPath ? ` (backup: ${result.backupPath})` : ''}\n`,
      );
    } catch (e) {
      process.stderr.write(`save failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  };

  const handleBack = () => {
    setView('selector');
    setSelectedSession(null);
    setMessages([]);
  };

  if (view === 'selector') {
    return (
      <Box>
        <SessionSelector
          projectPath={projectPath}
          onSelect={handleSessionSelect}
          onQuit={() => exit()}
        />
      </Box>
    );
  }

  if (view === 'editor' && selectedSession) {
    return (
      <Box>
        <SessionEditor
          messages={messages}
          sessionFile={selectedSession.filePath}
          sessionId={selectedSession.id}
          onSave={handleSave}
          onBack={handleBack}
          onQuit={() => exit()}
        />
      </Box>
    );
  }

  return null;
}
