import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseJsonlFile } from '../packages/core/src/jsonl/parser.js';
import { readMetadataLines } from '../packages/core/src/jsonl/serializer.js';
import { toMessageNode } from './helpers.js';
import {
  classify, canDelete, canEdit, HARD_BLOCK, NO_EDIT,
} from '../packages/core/src/analyzer/kind.js';

const FIXTURE = resolve(__dirname, 'fixtures/session-rich.jsonl');

describe('kind.classify', () => {
  it('classifies metadata types', () => {
    const meta = readMetadataLines(FIXTURE).map(r => toMessageNode(r, 0));
    const permissionMode = meta.find(m => m.type === 'permission-mode');
    expect(permissionMode?.kind).toBe('metadata');
    expect(meta.find(m => m.type === 'custom-title')?.kind).toBe('metadata');
    expect(meta.find(m => m.type === 'tag')?.kind).toBe('metadata');
    expect(meta.find(m => m.type === 'summary')?.kind).toBe('metadata');
  });

  it('classifies system subtype compact_boundary as compact-boundary', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const compact = msgs.find(m => m.type === 'system' && (m.raw as { subtype?: string }).subtype === 'compact_boundary');
    expect(compact?.kind).toBe('compact-boundary');
  });

  it('classifies isMeta:true user as meta-injection', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const meta = msgs.find(m => (m.raw as { isMeta?: boolean }).isMeta === true);
    expect(meta?.kind).toBe('meta-injection');
  });
  it('classifies user with tool_result first block as tool-result', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const result = msgs.find(m => m.kind === 'tool-result');
    expect(result).toBeDefined();
    expect(result!.raw.type).toBe('user');
  });

  it('classifies bare user prompts as human', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const human = msgs.find(m => m.kind === 'human');
    expect(human).toBeDefined();
    expect(human!.textContent).toBe('帮我写一个登录页面');
  });

  it('classifies assistant without tool_use as assistant-text', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const a = msgs.find(m => m.kind === 'assistant-text');
    expect(a).toBeDefined();
  });

  it('classifies assistant with tool_use as assistant-with-tools', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const a = msgs.find(m => m.kind === 'assistant-with-tools');
    expect(a).toBeDefined();
    expect(a!.toolCalls.length).toBeGreaterThan(0);
  });

  it('classifies isSidechain messages as sidechain-*', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const sh = msgs.find(m => m.kind === 'sidechain-human');
    const sa = msgs.find(m => m.kind === 'sidechain-assistant');
    expect(sh).toBeDefined();
    expect(sa).toBeDefined();
  });

  it('canDelete is false for every HARD_BLOCK kind', () => {
    for (const k of HARD_BLOCK) {
      expect(canDelete(k)).toBe(false);
    }
  });

  it('canEdit is false for every NO_EDIT kind (including tool-result)', () => {
    for (const k of NO_EDIT) {
      expect(canEdit(k)).toBe(false);
    }
    expect(NO_EDIT.has('tool-result')).toBe(true);
  });

  it('canDelete is true and canEdit is true for human + assistant-text', () => {
    expect(canDelete('human')).toBe(true);
    expect(canEdit('human')).toBe(true);
    expect(canDelete('assistant-text')).toBe(true);
    expect(canEdit('assistant-text')).toBe(true);
  });

  it('canEdit is false for assistant-with-tools (must use targeted tool edit, not in scope)', () => {
    // assistant-with-tools is HARD_BLOCK (deletable is the question to ask),
    // but we currently allow text editing. Refine: it should be NO_EDIT
    // because preserving the tool_use block while rewriting text in
    // isolation produces a state cc has never seen.
    expect(canEdit('assistant-with-tools')).toBe(false);
  });
});
