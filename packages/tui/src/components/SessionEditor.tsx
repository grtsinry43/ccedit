/**
 * SessionEditor — the message-edit screen.
 *
 * Visual structure (mirrors cc's fullscreen-with-pane layout):
 *
 *   ┌─────────────────── Header (session id, message count) ──┐
 *   │  MessageList (virtualised, collapsed into entries)      │
 *   ├─────────────────── Footer (mode-aware hints) ───────────┤
 *   │  Toast (transient)                                      │
 *   │  Detail / Confirm / Edit pane (only when active)        │
 *   └─────────────────────────────────────────────────────────┘
 *
 * View state is a small union; each state owns its own keys. The
 * giant `useInput` if-tree from the legacy version is gone.
 *
 * This version is "kind-aware": Space/E/D are gated by
 * `canDelete(kind)` and `canEdit(kind)`. Deletion goes through
 * `planDelete` so tool_use / tool_result stay in sync.
 */
import React, { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import {
  MessageNode, getAffectedFiles, buildPairs, planDelete, setMessageText, stripImages,
  canDelete, canEdit, type MessageKind,
} from '@ccedit/core';
import { Header, Footer } from './Chrome.js';
import { MessageList } from './MessageList.js';
import { MessageDetail } from './MessageDetail.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { EditPane } from './EditPane.js';
import { Pane } from './Pane.js';
import { Toast, type ToastState } from './Toast.js';
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js';
import { useTheme } from '../theme.js';

type View =
  | { kind: 'list' }
  | { kind: 'detail' }
  | { kind: 'confirm' }
  | { kind: 'edit' }
  | { kind: 'strip' };

interface Props {
  messages: MessageNode[];
  sessionFile: string;
  sessionId: string;
  onSave: (messages: MessageNode[]) => void;
  onBack: () => void;
  onQuit: () => void;
}

const HARD_BLOCK_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'metadata', 'progress', 'attachment', 'system', 'compact-boundary',
  'meta-injection', 'sidechain-human', 'sidechain-assistant',
]);
const SIDECHAIN_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'sidechain-human', 'sidechain-assistant',
]);

function describeKind(kind: MessageKind): string {
  switch (kind) {
    case 'metadata': return 'metadata — preserved verbatim';
    case 'progress': return 'live progress — never persisted';
    case 'attachment': return 'attachment — runtime-managed';
    case 'system': return 'system — runtime-managed';
    case 'compact-boundary': return 'compact boundary — required for resume';
    case 'meta-injection': return 'injected meta — runtime-managed';
    case 'sidechain-human':
    case 'sidechain-assistant': return 'sidechain — subagent transcript';
    case 'tool-result': return 'tool result — read-only (lies to claude otherwise)';
    case 'assistant-with-tools': return 'assistant + tool_use — edit not supported';
    default: return kind;
  }
}

export default function SessionEditor({
  messages: initialMessages, sessionFile, sessionId, onSave, onBack, onQuit,
}: Props) {
  const { colors: c } = useTheme();
  const width = process.stdout.columns || 100;
  const rows = process.stdout.rows || 24;
  const listHeight = Math.max(5, rows - 10);

  const [messages, setMessages] = useState<MessageNode[]>(initialMessages);
  const [focused, setFocused] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [edited, setEdited] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(() => new Set());
  const [view, setView] = useState<View>({ kind: 'list' });
  const [editValue, setEditValue] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  // The fully-resolved delete plan awaiting confirmation. Always set
  // before entering the confirm view — the previous version only stored
  // it for the orphan case, so confirming a plain delete silently did
  // nothing.
  const [pendingDelete, setPendingDelete] = useState<null | {
    toDelete: Set<string>;
    autoAdded: Set<string>;
    warnings: string[];
  }>(null);

  const pairing = useMemo(() => buildPairs(messages), [messages]);
  const selectedMessages = useMemo(
    () => messages.filter(m => selected.has(m.uuid)),
    [messages, selected],
  );
  const sideEffectCount = useMemo(
    () => selectedMessages.filter(m => m.hasSideEffects).length,
    [selectedMessages],
  );
  const affectedFiles = useMemo(
    () => getAffectedFiles(selectedMessages),
    [selectedMessages],
  );
  const allImageMessages = useMemo(
    () => messages.filter(m => m.imageCount > 0),
    [messages],
  );
  const sumImages = (ms: MessageNode[]) => ms.reduce((n, m) => n + m.imageCount, 0);

  // The list is collapsed into entries (group / section / message).
  // The focused index in this UI is the entry index, not the raw
  // messages index.
  type Entry =
    | { kind: 'message'; node: MessageNode }
    | { kind: 'group'; children: MessageNode[]; agentId?: string }
    | { kind: 'section'; node: MessageNode };

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.kind === 'compact-boundary') {
        out.push({ kind: 'section', node: m });
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
        out.push({ kind: 'group', children: group, agentId: startAgent });
        i = j;
        continue;
      }
      out.push({ kind: 'message', node: m });
      i++;
    }
    return out;
  }, [messages]);

  const focusedEntry = entries[focused];
  const focusedMessage = focusedEntry?.kind === 'message' ? focusedEntry.node : null;
  const focusedIsGroup = focusedEntry?.kind === 'group';
  const focusedIsSection = focusedEntry?.kind === 'section';
  const sessionLabel = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId;

  const notify = (level: ToastState['level'], message: string) => {
    setToast({ level, message, ttlMs: 2500 });
  };

  // Strip images out of the given messages (keeping the chain intact —
  // unlike deletion, this never touches uuids). Marks changed rows as
  // edited so the ✎ marker reminds the user to W (write) to disk.
  const applyStrip = (targets: MessageNode[]) => {
    const targetSet = new Set(targets.filter(m => m.imageCount > 0).map(m => m.uuid));
    if (targetSet.size === 0) {
      notify('info', 'no images to strip here');
      setView({ kind: 'list' });
      return;
    }
    let removed = 0;
    const changed = new Set<string>();
    const next = messages.map(m => {
      if (!targetSet.has(m.uuid)) return m;
      const r = stripImages(m);
      if (r.removed > 0) { removed += r.removed; changed.add(m.uuid); }
      return r.node;
    });
    setMessages(next);
    setEdited(prev => { const s = new Set(prev); for (const u of changed) s.add(u); return s; });
    notify(
      'success',
      `stripped ${removed} image${removed === 1 ? '' : 's'} from ${changed.size} message${changed.size === 1 ? '' : 's'} · W to write`,
    );
    setView({ kind: 'list' });
  };

  useInput((input, key) => {
    if (view.kind === 'edit') {
      if (key.escape) {
        setView({ kind: 'list' });
        setEditValue('');
      }
      return;
    }

    if (view.kind === 'confirm') {
      if (input === 'y' || input === 'Y') {
        if (pendingDelete) {
          const removed = pendingDelete.toDelete;
          const next = messages.filter(m => !removed.has(m.uuid));
          setMessages(next);
          setSelected(new Set());
          setFocused(f => Math.max(0, Math.min(f, next.length - 1)));
          setPendingDelete(null);
          notify('success', `deleted ${removed.size} message${removed.size === 1 ? '' : 's'} · W to write`);
        }
        setView({ kind: 'list' });
      } else if (input === 'n' || input === 'N' || key.escape) {
        setPendingDelete(null);
        setView({ kind: 'list' });
      }
      return;
    }

    if (view.kind === 'strip') {
      if (key.escape) { setView({ kind: 'list' }); return; }
      if (input === 'f' || input === 'F') {
        applyStrip(focusedMessage ? [focusedMessage] : []);
      } else if (input === 's' || input === 'S') {
        applyStrip(selectedMessages);
      } else if (input === 'a' || input === 'A') {
        applyStrip(allImageMessages);
      }
      return;
    }

    if (view.kind === 'detail') {
      if (key.escape) {
        setView({ kind: 'list' });
      } else if (input === 'e' || input === 'E') {
        if (focusedMessage) {
          if (!canEdit(focusedMessage.kind)) {
            notify('warn', `locked: ${describeKind(focusedMessage.kind)}`);
            return;
          }
          setEditValue(focusedMessage.textContent);
          setView({ kind: 'edit' });
        }
      } else if (input === 'd' || input === 'D') {
        if (focusedMessage) {
          if (!canDelete(focusedMessage.kind)) {
            notify('warn', `cannot delete: ${describeKind(focusedMessage.kind)}`);
            return;
          }
          setSelected(new Set([focusedMessage.uuid]));
          const plan = planDelete(new Set([focusedMessage.uuid]), messages, pairing);
          if (!plan.allowed) {
            notify('warn', `blocked: ${plan.blocked[0].reason}`);
            return;
          }
          setPendingDelete({ toDelete: plan.toDelete, autoAdded: plan.autoAdded, warnings: plan.orphanWarnings });
          setView({ kind: 'confirm' });
        }
      }
      return;
    }

    // ─── list ────────────────────────────────────────────────────────────
    if (key.upArrow) {
      setFocused(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setFocused(i => Math.min(entries.length - 1, i + 1));
    } else if (key.pageUp) {
      setFocused(i => Math.max(0, i - listHeight));
    } else if (key.pageDown) {
      setFocused(i => Math.min(entries.length - 1, i + listHeight));
    } else if (key.return) {
      if (focusedIsGroup) {
        setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(focused)) next.delete(focused);
          else next.add(focused);
          return next;
        });
      } else if (focusedMessage) {
        setView({ kind: 'detail' });
      }
    } else if (input === ' ') {
      if (focusedIsGroup) {
        setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(focused)) next.delete(focused);
          else next.add(focused);
          return next;
        });
      } else if (focusedMessage) {
        const k = focusedMessage.kind;
        if (!canDelete(k)) {
          notify('warn', `cannot select: ${describeKind(k)}`);
          return;
        }
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(focusedMessage.uuid)) next.delete(focusedMessage.uuid);
          else next.add(focusedMessage.uuid);
          return next;
        });
      } else if (focusedIsSection) {
        // compact-boundary is a no-op; just acknowledge.
        notify('info', 'compact boundary — preserved');
      }
    } else if (input === 'e' || input === 'E') {
      if (focusedMessage) {
        if (!canEdit(focusedMessage.kind)) {
          notify('warn', `cannot edit: ${describeKind(focusedMessage.kind)}`);
          return;
        }
        setEditValue(focusedMessage.textContent);
        setView({ kind: 'edit' });
      }
    } else if (input === 'd' || input === 'D') {
      if (selected.size === 0) {
        notify('info', 'select at least one message first');
        return;
      }
      const plan = planDelete(selected, messages, pairing);
      if (!plan.allowed) {
        const head = plan.blocked[0];
        notify('warn', `blocked: ${head.uuid} (${describeKind(head.kind)})`);
        return;
      }
      setPendingDelete({ toDelete: plan.toDelete, autoAdded: plan.autoAdded, warnings: plan.orphanWarnings });
      setView({ kind: 'confirm' });
    } else if (input === 'i' || input === 'I') {
      if (allImageMessages.length === 0) {
        notify('info', 'no image attachments in this session');
        return;
      }
      setView({ kind: 'strip' });
    } else if (input === 'a' && key.ctrl) {
      // Ctrl-A: select all deletable
      const all = new Set(messages.filter(m => canDelete(m.kind)).map(m => m.uuid));
      setSelected(all);
    } else if (input === 'x' && key.ctrl) {
      setSelected(new Set());
    } else if (input === 'w' || input === 'W') {
      onSave(messages);
      onQuit();
    } else if (input === 'b' || input === 'B') {
      onBack();
    } else if (input === 'q' || input === 'Q') {
      onQuit();
    }
  });

  const handleEditSubmit = (value: string) => {
    if (!focusedMessage) { setView({ kind: 'list' }); return; }
    if (!value.trim()) { setView({ kind: 'list' }); return; }
    try {
      const next = messages.slice();
      const updated = setMessageText(focusedMessage, value);
      const idx = next.findIndex(m => m.uuid === focusedMessage.uuid);
      if (idx >= 0) next[idx] = updated;
      setMessages(next);
      setEdited(prev => new Set(prev).add(focusedMessage.uuid));
      notify('success', 'edit saved · W to write to disk');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'edit failed');
    }
    setView({ kind: 'list' });
    setEditValue('');
  };

  // --- render ---------------------------------------------------------------
  const showDetail = view.kind === 'detail' && focusedMessage;
  const showConfirm = view.kind === 'confirm';
  const showEdit = view.kind === 'edit';
  const showStrip = view.kind === 'strip';

  const status =
    selected.size > 0
      ? <Text color={sideEffectCount > 0 ? c.warning : c.inactive}>
          {selected.size} selected{sideEffectCount > 0 ? ` · ${sideEffectCount} ${'⚠'}` : ''}
        </Text>
      : <Text color={c.inactive}>{messages.length} messages</Text>;

  const hints = (() => {
    if (showEdit) return [
      <KeyboardShortcutHint key="s" shortcut="enter" action="save" />,
      <KeyboardShortcutHint key="c" shortcut="esc" action="cancel" />,
    ];
    if (showConfirm) return [
      <KeyboardShortcutHint key="y" shortcut="Y" action="confirm" />,
      <KeyboardShortcutHint key="n" shortcut="N" action="cancel" />,
    ];
    if (showStrip) return [
      <KeyboardShortcutHint key="f" shortcut="F" action="focused" />,
      <KeyboardShortcutHint key="s" shortcut="S" action="selected" />,
      <KeyboardShortcutHint key="a" shortcut="A" action="all" />,
      <KeyboardShortcutHint key="c" shortcut="esc" action="cancel" />,
    ];
    if (showDetail) return [
      <KeyboardShortcutHint key="b" shortcut="esc" action="back" />,
      <KeyboardShortcutHint key="e" shortcut="E" action="edit" />,
      <KeyboardShortcutHint key="d" shortcut="D" action="delete" />,
    ];
    if (focusedIsGroup) return [
      <KeyboardShortcutHint key="nav" shortcut="↑↓" action="navigate" />,
      <KeyboardShortcutHint key="ex" shortcut="enter" action="expand" />,
      <KeyboardShortcutHint key="save" shortcut="W" action="save" />,
      <KeyboardShortcutHint key="back" shortcut="B" action="back" />,
      <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />,
    ];
    if (focusedMessage && HARD_BLOCK_KINDS.has(focusedMessage.kind)) {
      return [
        <KeyboardShortcutHint key="nav" shortcut="↑↓" action="navigate" />,
        <Text key="lock" color={c.inactive}>⏏ locked</Text>,
        <KeyboardShortcutHint key="save" shortcut="W" action="save" />,
        <KeyboardShortcutHint key="back" shortcut="B" action="back" />,
        <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />,
      ];
    }
    return [
      <KeyboardShortcutHint key="nav" shortcut="↑↓" action="navigate" />,
      <KeyboardShortcutHint key="sel" shortcut="space" action="select" />,
      <KeyboardShortcutHint key="open" shortcut="enter" action="open" />,
      <KeyboardShortcutHint key="edit" shortcut="E" action="edit" />,
      <KeyboardShortcutHint key="del" shortcut="D" action="delete" />,
      <KeyboardShortcutHint key="img" shortcut="I" action="strip img" />,
      <KeyboardShortcutHint key="save" shortcut="W" action="save" />,
      <KeyboardShortcutHint key="back" shortcut="B" action="back" />,
      <KeyboardShortcutHint key="q" shortcut="Q" action="quit" />,
    ];
  })();

  return (
    <Box flexDirection="column">
      <Header
        title={`ccedit · ${sessionLabel}`}
        subtitle={sessionFile}
        right={status}
        width={width}
      />

      {!showEdit && !showConfirm && (
        <MessageList
          messages={messages}
          focusedIndex={focused}
          selectedIds={selected}
          editedIds={edited}
          width={width}
          height={listHeight}
          expandedGroups={expandedGroups}
        />
      )}

      {showDetail && (
        <MessageDetail
          message={focusedMessage!}
          messages={messages}
          width={width}
        />
      )}

      {showConfirm && (
        <ConfirmDialog
          message={(() => {
            const n = pendingDelete?.toDelete.size ?? 0;
            const auto = pendingDelete?.autoAdded.size ?? 0;
            const warn = pendingDelete?.warnings.length ? `\n${pendingDelete.warnings[0]}` : '';
            const pairNote = auto > 0
              ? ` (incl. ${auto} paired tool message${auto === 1 ? '' : 's'})`
              : '';
            return `Delete ${n} message${n === 1 ? '' : 's'}${pairNote}?${warn}`;
          })()}
          affectedFiles={affectedFiles}
          sideEffectCount={sideEffectCount}
          width={width}
          onConfirm={() => setView({ kind: 'list' })}
          onCancel={() => setView({ kind: 'list' })}
        />
      )}

      {showStrip && (
        <Pane width={width} accent={c.warning}>
          <Box>
            <Text color={c.warning} bold>▣ strip images — replace with [image removed]</Text>
          </Box>
          <Box flexDirection="column" paddingTop={1}>
            <Text color={c.text}>
              <Text color={c.success} bold>F</Text>
              <Text> focused message · {focusedMessage?.imageCount ?? 0} image(s)</Text>
            </Text>
            <Text color={c.text}>
              <Text color={c.success} bold>S</Text>
              <Text> selected · {sumImages(selectedMessages)} image(s) across {selectedMessages.filter(m => m.imageCount > 0).length} msg(s)</Text>
            </Text>
            <Text color={c.text}>
              <Text color={c.success} bold>A</Text>
              <Text> all in session · {sumImages(allImageMessages)} image(s) across {allImageMessages.length} msg(s)</Text>
            </Text>
            <Box paddingTop={1}>
              <Text color={c.inactive}>esc to cancel · text is preserved, only images are removed</Text>
            </Box>
          </Box>
        </Pane>
      )}

      {showEdit && focusedMessage && (
        <EditPane
          indexLabel={`L${focused + 1}`}
          initialValue={editValue}
          width={width}
          onSubmit={handleEditSubmit}
          onCancel={() => { setView({ kind: 'list' }); setEditValue(''); }}
        />
      )}

      <Toast toast={toast} onExpire={() => setToast(null)} />
      <Footer width={width} hints={hints} />
    </Box>
  );
}
