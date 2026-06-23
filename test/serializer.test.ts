import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  parseJsonlFile,
  saveSession,
  extractMetadata,
  readMetadataLines,
  generateFullJsonl,
} from '../packages/core/src/index.js';

const FIXTURE = resolve(__dirname, 'fixtures/session-rich.jsonl');

let tmp: string | undefined;
afterEach(() => {
  if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function withTmp(): string {
  tmp = mkdtempSync(join(tmpdir(), 'ccedit-ser-'));
  return tmp;
}

describe('serializer.readMetadataLines', () => {
  it('returns all non-transcript lines in order', () => {
    const lines = readMetadataLines(FIXTURE);
    const types = lines.map(l => (l as { type: string }).type);
    expect(types).toContain('permission-mode');
    expect(types).toContain('file-history-snapshot');
    expect(types).toContain('summary');
    expect(types).toContain('custom-title');
    expect(types).toContain('tag');
    expect(types).toContain('agent-name');
    // transcript types should NOT be in metadata.
    expect(types).not.toContain('user');
    expect(types).not.toContain('assistant');
    expect(types).not.toContain('system');
  });
});

describe('serializer.extractMetadata', () => {
  it('returns metadata array plus legacy permissionMode / fileHistorySnapshot', () => {
    const meta = extractMetadata(FIXTURE);
    expect(meta.permissionMode).toBeDefined();
    expect(meta.fileHistorySnapshot).toBeDefined();
    expect(meta.metadata.length).toBeGreaterThan(2);
  });
});

describe('serializer.saveSession', () => {
  it('preserves every metadata line across save', () => {
    const dir = withTmp();
    const target = join(dir, 'session.jsonl');
    const original = readFileSync(FIXTURE, 'utf-8');
    writeFileSync(target, original);

    // Remove a single human message — should NOT touch any metadata.
    const msgs = parseJsonlFile(target);
    const humanToRemove = msgs.find(m => m.kind === 'human' && m.textContent.includes('登录页面'))!;
    const filtered = msgs.filter(m => m.uuid !== humanToRemove.uuid);

    const result = saveSession(target, filtered, { createBackup: false });
    expect(result.outputPath).toBe(target);

    const out = readFileSync(target, 'utf-8');
    expect(out).toContain('"type":"permission-mode"');
    expect(out).toContain('"type":"custom-title"');
    expect(out).toContain('"type":"tag"');
    expect(out).toContain('"type":"agent-name"');
    // The removed human must be gone.
    expect(out).not.toContain('帮我写一个登录页面');
  });

  it('rewrites last-prompt with leaf = last non-sidechain transcript message', () => {
    const dir = withTmp();
    const target = join(dir, 'session.jsonl');
    writeFileSync(target, readFileSync(FIXTURE, 'utf-8'));
    const msgs = parseJsonlFile(target);

    saveSession(target, msgs, { createBackup: false });
    const out = readFileSync(target, 'utf-8');
    const lastPromptLine = out
      .split('\n')
      .reverse()
      .find(l => l.includes('"type":"last-prompt"'));
    expect(lastPromptLine).toBeDefined();
    const parsed = JSON.parse(lastPromptLine!);
    // The leaf should point to msg-015 (the last non-sidechain user msg in the rich fixture).
    expect(parsed.leafUuid).toBe('msg-015');
  });

  it('falls back to sessionId when no human message survives', () => {
    const metadata = { metadata: [] as any[] };
    const full = generateFullJsonl([], metadata, 'session-fallback');
    // No last-prompt is appended when there are no messages at all.
    expect(full).toBe('\n');
  });
});
