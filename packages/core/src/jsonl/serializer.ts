import { writeFileSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { MessageNode, RawMessage } from '../types.js';
import { updateLeafUuid } from './repair.js';
import { isTranscriptMessage } from '../analyzer/kind.js';

export interface SerializationOptions {
  preserveMetadata?: boolean;
  createBackup?: boolean;
  backupSuffix?: string;
}

/**
 * 序列化消息数组为 JSONL 字符串
 */
export function serializeMessages(messages: MessageNode[]): string {
  return messages
    .map(msg => JSON.stringify(msg.raw))
    .join('\n') + '\n';
}

/**
 * Reads every non-transcript JSONL line from the source file. The
 * returned array preserves the on-disk order so that round-tripping
 * produces byte-stable output for unchanged files. The editor uses
 * this as the source of truth for the metadata lines it will
 * prepend on save — letting users "delete" a metadata line is
 * impossible because it is never part of the `messages` array.
 */
export function readMetadataLines(filePath: string): RawMessage[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const out: RawMessage[] = [];
  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as RawMessage & { type?: string };
      const t = raw.type;
      if (!t) continue;
      // We treat compact-boundary / system / attachment as transcript
      // (they live in the chain). Everything else is metadata.
      if (isMetadataType(t)) out.push(raw as RawMessage);
    } catch {
      // Skip invalid lines, same as the parser.
    }
  }
  return out;
}

function isMetadataType(t: string): boolean {
  if (t === 'user' || t === 'assistant' || t === 'attachment' || t === 'system') return false;
  return true;
}

/**
 * 从原始 JSONL 文件中提取元数据行（permission-mode, file-history-snapshot,
 * 以及所有其它非 transcript 行）。
 *
 * @deprecated Use {@link readMetadataLines} for round-tripping. Kept for
 * back-compat with the public API.
 */
export function extractMetadata(filePath: string): {
  permissionMode?: RawMessage;
  fileHistorySnapshot?: RawMessage;
  // All metadata lines, including the two above, in order. Exposed so
  // callers can opt into the full set without changing their import
  // shape.
  metadata: RawMessage[];
} {
  const all = readMetadataLines(filePath);
  let permissionMode: RawMessage | undefined;
  let fileHistorySnapshot: RawMessage | undefined;
  for (const m of all) {
    if (m.type === 'permission-mode') permissionMode = m;
    else if (m.type === 'file-history-snapshot') fileHistorySnapshot = m;
  }
  return { permissionMode, fileHistorySnapshot, metadata: all };
}

/**
 * Generates the full JSONL body to write. Order:
 *   1. metadata lines from the source (preserved)
 *   2. edited messages
 *   3. last-prompt (recomputed from the edited transcript's tail)
 */
export function generateFullJsonl(
  messages: MessageNode[],
  metadata: { permissionMode?: RawMessage; fileHistorySnapshot?: RawMessage; metadata?: RawMessage[] },
  sessionId?: string
): string {
  const lines: string[] = [];

  // Emit the FULL metadata set, not just the legacy two fields. cc
  // (and our parser) accept any number of metadata lines, so passing
  // them all is the safe round-trip. The legacy fields are kept
  // exposed for back-compat callers.
  //
  // `last-prompt` is filtered out here: cc appends it at every session
  // exit, and we re-emit a fresh one at the tail of the file. Letting
  // the original through would leave two `last-prompt` lines, the
  // older of which would shadow our recomputed leafUuid.
  if (metadata.metadata && metadata.metadata.length > 0) {
    for (const m of metadata.metadata) {
      if ((m as { type?: string }).type === 'last-prompt') continue;
      lines.push(JSON.stringify(m));
    }
  } else {
    if (metadata.permissionMode) lines.push(JSON.stringify(metadata.permissionMode));
    if (metadata.fileHistorySnapshot) lines.push(JSON.stringify(metadata.fileHistorySnapshot));
  }

  for (const msg of messages) {
    lines.push(JSON.stringify(msg.raw));
  }

  const leafUuid = updateLeafUuid(messages);
  if (leafUuid) {
    const lastPrompt = lastPromptFor(messages, sessionId || '');
    lines.push(JSON.stringify({
      type: 'last-prompt',
      lastPrompt,
      leafUuid,
      sessionId: sessionId || '',
    }));
  }

  return lines.join('\n') + '\n';
}

/**
 * Pick a representative last-prompt text from the surviving messages:
 * the last human-typed user message, truncated to ~80 chars. If none
 * exists, fall back to the sessionId (cc treats empty `lastPrompt`
 * as invalid).
 */
function lastPromptFor(messages: MessageNode[], fallback: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'human') {
      const t = m.textContent.trim();
      if (t) return t.length > 80 ? t.slice(0, 77) + '…' : t;
    }
  }
  return fallback;
}

/**
 * 创建备份文件
 */
export function createBackup(filePath: string, suffix: string = '.bak'): string {
  let backupPath = filePath + suffix;
  let counter = 1;

  // 如果备份已存在，添加数字后缀
  while (existsSync(backupPath)) {
    backupPath = `${filePath}${suffix}.${counter}`;
    counter++;
  }

  copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * 保存编辑后的会话到文件
 */
export function saveSession(
  filePath: string,
  messages: MessageNode[],
  options: SerializationOptions = {}
): { backupPath?: string; outputPath: string } {
  const {
    preserveMetadata = true,
    createBackup: shouldBackup = true,
    backupSuffix = '.bak'
  } = options;

  // 创建备份
  let backupPath: string | undefined;
  if (shouldBackup && existsSync(filePath)) {
    backupPath = createBackup(filePath, backupSuffix);
  }

  // 提取元数据
  const metadata = preserveMetadata ? extractMetadata(filePath) : { metadata: [] };

  // 生成完整 JSONL
  const content = generateFullJsonl(messages, metadata, sessionIdFromPath(filePath));

  // 写入文件
  writeFileSync(filePath, content, 'utf-8');

  return { backupPath, outputPath: filePath };
}

function sessionIdFromPath(filePath: string): string {
  const base = filePath.split('/').pop() || '';
  return base.replace(/\.jsonl$/, '');
}
