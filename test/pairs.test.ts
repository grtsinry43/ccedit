import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseJsonlFile } from '../packages/core/src/jsonl/parser.js';
import { readMetadataLines } from '../packages/core/src/jsonl/serializer.js';
import { toMessageNode } from './helpers.js';
import { buildPairs, planDelete } from '../packages/core/src/analyzer/pairs.js';

const FIXTURE = resolve(__dirname, 'fixtures/session-rich.jsonl');

// Build a "unified" list combining transcript messages and metadata
// rows so planDelete tests can exercise both kinds in one shot.
function unified() {
  const transcript = parseJsonlFile(FIXTURE);
  const meta = readMetadataLines(FIXTURE).map((r, i) => toMessageNode(r, transcript.length + i));
  return [...transcript, ...meta];
}

describe('pairs.buildPairs', () => {
  it('finds all three tool_use ↔ tool_result pairs in the rich fixture', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const pairing = buildPairs(msgs);

    // Each tool_use we know about must have a non-null result.
    const tu001 = pairing.byToolUse.get('toolu-rich-001');
    const tu002 = pairing.byToolUse.get('toolu-rich-002');
    const tu003 = pairing.byToolUse.get('toolu-rich-003');
    expect(tu001?.toolResultUuid).toBeTruthy();
    expect(tu002?.toolResultUuid).toBeTruthy();
    expect(tu003?.toolResultUuid).toBeTruthy();
  });

  it('cross-links pairedWith on both ends of the pair', () => {
    const msgs = parseJsonlFile(FIXTURE);
    const tu = msgs.find(m => m.toolCalls.some(tc => tc.toolUseId === 'toolu-rich-001'))!;
    const tr = msgs.find(m => m.kind === 'tool-result' && m.toolCalls.length === 0 &&
      ((m.raw as { message?: { content?: Array<{ tool_use_id?: string }> } }).message?.content?.[0]?.tool_use_id === 'toolu-rich-001'))!;
    expect(tu.pairedWith).toBe(tr.uuid);
    expect(tr.pairedWith).toBe(tu.uuid);
  });
});

describe('pairs.planDelete', () => {
  it('refuses to delete a metadata row', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const meta = msgs.find(m => m.kind === 'metadata')!;
    const plan = planDelete(new Set([meta.uuid]), msgs, pairing);
    expect(plan.allowed).toBe(false);
    expect(plan.blocked[0].kind).toBe('metadata');
    expect(plan.toDelete.has(meta.uuid)).toBe(false);
  });

  it('refuses to delete a compact-boundary', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const compact = msgs.find(m => m.kind === 'compact-boundary')!;
    const plan = planDelete(new Set([compact.uuid]), msgs, pairing);
    expect(plan.allowed).toBe(false);
  });

  it('refuses to delete a meta-injection', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const m = msgs.find(m => m.kind === 'meta-injection')!;
    const plan = planDelete(new Set([m.uuid]), msgs, pairing);
    expect(plan.allowed).toBe(false);
  });

  it('auto-extends with tool_result when tool_use is selected', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const tu = msgs.find(m => m.toolCalls.some(tc => tc.toolUseId === 'toolu-rich-001'))!;
    const tr = pairing.byToolUse.get('toolu-rich-001')!.toolResultUuid!;
    const plan = planDelete(new Set([tu.uuid]), msgs, pairing);
    expect(plan.allowed).toBe(true);
    expect(plan.toDelete.has(tu.uuid)).toBe(true);
    expect(plan.toDelete.has(tr)).toBe(true);
  });

  it('atomically pulls in the tool_use when only the tool_result is selected', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const pair = pairing.byToolUse.get('toolu-rich-001')!;
    const tr = pair.toolResultUuid!;
    const tu = pair.toolUseUuid;
    const plan = planDelete(new Set([tr]), msgs, pairing);
    expect(plan.allowed).toBe(true);
    // The partner tool_use is pulled in so no orphan survives, and it is
    // reported as auto-added (the user only picked the tool_result).
    expect(plan.toDelete.has(tr)).toBe(true);
    expect(plan.toDelete.has(tu)).toBe(true);
    expect(plan.autoAdded.has(tu)).toBe(true);
    expect(plan.autoAdded.has(tr)).toBe(false);
    expect(plan.orphanWarnings.length).toBe(0);
  });

  it('plain human deletion is allowed and clean', () => {
    const msgs = unified();
    const pairing = buildPairs(msgs);
    const human = msgs.find(m => m.kind === 'human' && m.textContent.includes('登录页面'))!;
    const plan = planDelete(new Set([human.uuid]), msgs, pairing);
    expect(plan.allowed).toBe(true);
    expect(plan.toDelete.has(human.uuid)).toBe(true);
    expect(plan.orphanWarnings.length).toBe(0);
  });
});
