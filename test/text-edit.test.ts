import { describe, it, expect } from 'vitest';
import { setMessageText } from '../packages/core/src/analyzer/text-edit.js';
import type { MessageNode } from '../packages/core/src/types.js';
import { classify } from '../packages/core/src/analyzer/kind.js';

function makeNode(overrides: Partial<MessageNode>): MessageNode {
  return {
    index: 0,
    uuid: 'u-1',
    parentUuid: null,
    type: 'user',
    role: 'user',
    textContent: 'orig',
    toolCalls: [],
    selected: false,
    hasSideEffects: false,
    raw: { type: 'user', message: { role: 'user', content: 'orig' } } as any,
    kind: 'human' as const,
    ...overrides,
  };
}

describe('text-edit.setMessageText', () => {
  it('replaces string content for human', () => {
    const node = makeNode({});
    const out = setMessageText(node, 'new prompt');
    const content = (out.raw as { message?: { content?: unknown } }).message?.content;
    expect(content).toBe('new prompt');
    expect(out.textContent).toBe('new prompt');
  });

  it('replaces first text block in array content (human)', () => {
    const node = makeNode({
      kind: 'human',
      raw: {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'old' },
            { type: 'image', source: { type: 'base64' } },
          ],
        },
      } as any,
    });
    const out = setMessageText(node, 'fresh');
    const blocks = (out.raw as { message?: { content?: any[] } }).message?.content as any[];
    expect(blocks[0].text).toBe('fresh');
    expect(blocks[1].type).toBe('image'); // image preserved
  });

  it('preserves thinking blocks on assistant-text edit', () => {
    const node = makeNode({
      kind: 'assistant-text',
      type: 'assistant',
      raw: {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I am thinking' },
            { type: 'text', text: 'old' },
          ],
        },
      } as any,
    });
    const out = setMessageText(node, 'fresh');
    const blocks = (out.raw as { message?: { content?: any[] } }).message?.content as any[];
    expect(blocks[0].thinking).toBe('I am thinking');
    expect(blocks[1].text).toBe('fresh');
  });

  it('appends a new text block when assistant has only thinking', () => {
    const node = makeNode({
      kind: 'assistant-text',
      type: 'assistant',
      raw: {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 't' }],
        },
      } as any,
    });
    const out = setMessageText(node, 'new text');
    const blocks = (out.raw as { message?: { content?: any[] } }).message?.content as any[];
    expect(blocks).toHaveLength(2);
    expect(blocks[1].text).toBe('new text');
  });

  it('refuses to edit a tool-result', () => {
    const node = makeNode({
      kind: 'tool-result',
      raw: {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] },
      } as any,
    });
    expect(() => setMessageText(node, 'lie')).toThrow(/tool-result/);
  });

  it('refuses to edit metadata', () => {
    const node = makeNode({
      kind: 'metadata',
      raw: { type: 'permission-mode', permissionMode: 'default' } as any,
    });
    expect(() => setMessageText(node, 'x')).toThrow(/metadata/);
  });
});
