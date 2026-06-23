import { describe, it, expect } from 'vitest';
import { stripImages, countImages } from '../packages/core/src/analyzer/image-strip.js';
import type { MessageNode } from '../packages/core/src/types.js';

function makeNode(content: unknown, kind: MessageNode['kind'] = 'human'): MessageNode {
  return {
    index: 0,
    uuid: 'u-1',
    parentUuid: null,
    type: kind === 'tool-result' ? 'user' : 'user',
    role: 'user',
    textContent: '',
    toolCalls: [],
    selected: false,
    hasSideEffects: false,
    imageCount: countImages(content),
    raw: { type: 'user', message: { role: 'user', content } } as any,
    kind,
  };
}

function contentOf(n: MessageNode): any[] {
  return (n.raw as { message?: { content?: any[] } }).message?.content as any[];
}

describe('image-strip.countImages', () => {
  it('counts top-level image blocks', () => {
    expect(countImages([
      { type: 'text', text: 'hi' },
      { type: 'image', source: { type: 'base64' } },
    ])).toBe(1);
  });

  it('counts images nested inside a tool_result', () => {
    expect(countImages([
      { type: 'tool_result', tool_use_id: 't', content: [
        { type: 'image', source: { type: 'base64' } },
        { type: 'image', source: { type: 'base64' } },
      ] },
    ])).toBe(2);
  });

  it('returns 0 for string content and image-free arrays', () => {
    expect(countImages('plain prompt')).toBe(0);
    expect(countImages([{ type: 'text', text: 'hi' }])).toBe(0);
  });
});

describe('image-strip.stripImages', () => {
  it('drops a top-level image but keeps sibling text', () => {
    const node = makeNode([
      { type: 'text', text: 'look at this' },
      { type: 'image', source: { type: 'base64' } },
    ]);
    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(1);
    expect(out.imageCount).toBe(0);
    const blocks = contentOf(out);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('look at this');
  });

  it('replaces an image-only user turn with a placeholder', () => {
    const node = makeNode([{ type: 'image', source: { type: 'base64' } }]);
    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(1);
    const blocks = contentOf(out);
    expect(blocks).toEqual([{ type: 'text', text: '[image removed]' }]);
  });

  it('strips an image nested in a tool_result, keeping the pair valid', () => {
    const node = makeNode([
      { type: 'tool_result', tool_use_id: 'call_1', content: [
        { type: 'image', source: { type: 'base64' } },
      ] },
    ], 'tool-result');
    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(1);
    expect(out.imageCount).toBe(0);
    const tr = contentOf(out)[0];
    expect(tr.type).toBe('tool_result');
    expect(tr.tool_use_id).toBe('call_1'); // pairing key preserved
    // tool_result content is never left empty (the API rejects that)
    expect(tr.content).toEqual([{ type: 'text', text: '[image removed]' }]);
  });

  it('keeps surrounding tool_result text when only the image is removed', () => {
    const node = makeNode([
      { type: 'tool_result', tool_use_id: 'call_1', content: [
        { type: 'text', text: 'screenshot attached' },
        { type: 'image', source: { type: 'base64' } },
      ] },
    ], 'tool-result');
    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(1);
    const tr = contentOf(out)[0];
    expect(tr.content).toEqual([{ type: 'text', text: 'screenshot attached' }]);
  });

  it('neutralizes the duplicate image cc stores in toolUseResult', () => {
    const node = makeNode([
      { type: 'tool_result', tool_use_id: 'call_1', content: [
        { type: 'image', source: { type: 'base64', data: 'AAAA' } },
      ] },
    ], 'tool-result');
    // cc denormalises the same screenshot here.
    (node.raw as any).toolUseResult = { type: 'image', file: { data: 'AAAA' } };

    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(1); // only the visible content image is counted
    const raw = out.raw as any;
    // No image survives anywhere, and the heavy base64 is gone.
    expect(JSON.stringify(raw)).not.toContain('"type":"image"');
    expect(JSON.stringify(raw)).not.toContain('AAAA');
    // toolUseResult is still present (structurally) as a text marker.
    expect(raw.toolUseResult).toEqual({ type: 'text', text: '[image removed]' });
  });

  it('is a no-op (same reference) when there are no images', () => {
    const node = makeNode([{ type: 'text', text: 'hi' }]);
    const { node: out, removed } = stripImages(node);
    expect(removed).toBe(0);
    expect(out).toBe(node);
  });

  it('does not mutate the original raw', () => {
    const node = makeNode([
      { type: 'text', text: 'hi' },
      { type: 'image', source: { type: 'base64' } },
    ]);
    stripImages(node);
    expect(contentOf(node)).toHaveLength(2); // original untouched
  });
});
