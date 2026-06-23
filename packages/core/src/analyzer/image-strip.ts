/**
 * image-strip — remove image attachments from a message.
 *
 * Some models reject sessions that contain images. The user wants to
 * keep using such a session with a non-vision model, which means the
 * images have to go but the conversation must stay valid.
 *
 * Images live in two places in a cc transcript:
 *
 *   1. Top-level in a user prompt — `message.content[i].type === 'image'`
 *      (the user pasted a screenshot into their turn).
 *   2. Nested inside a tool_result — `message.content[i].type ===
 *      'tool_result'` whose own `content` array holds an `image` block
 *      (a tool returned a screenshot).
 *
 * Stripping rules (chosen so the result is always API-valid):
 *
 *   - Drop every `image` block.
 *   - If dropping leaves a *container* empty (the message's own content,
 *     or a tool_result's content), insert a single `[image removed]`
 *     text block. An empty tool_result content is rejected by the API,
 *     and an empty user turn is meaningless — the placeholder keeps the
 *     tool_use ↔ tool_result pair intact without lying about a result.
 *
 * The function returns a NEW node; raw is not mutated. uuid / parentUuid
 * are untouched, so no chain repair is needed (unlike deletion).
 */
import type { MessageNode } from '../types.js';

interface Block {
  type?: string;
  content?: unknown;
  [k: string]: unknown;
}

const PLACEHOLDER: Block = { type: 'text', text: '[image removed]' };

function isImage(b: unknown): boolean {
  return !!b && typeof b === 'object' && (b as Block).type === 'image';
}

/** Count image blocks reachable from a raw message (top-level + nested
 *  in tool_result content). Shared with the parser. */
export function countImages(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const b of content as Block[]) {
    if (isImage(b)) {
      n++;
    } else if (b?.type === 'tool_result' && Array.isArray(b.content)) {
      n += (b.content as unknown[]).filter(isImage).length;
    }
  }
  return n;
}

/**
 * Recursively replace every `image` object anywhere in a value with a
 * lightweight `[image removed]` text marker. Used for the cc-internal
 * `toolUseResult` field, whose shape is freeform (cc denormalises a tool
 * screenshot there as `{ type: 'image', file: {...base64...} }`, or nested
 * inside `content` arrays). Replacing rather than deleting keeps the field
 * structurally present so cc's display code does not trip over a hole.
 */
function neutralizeImages(v: unknown): { value: unknown; removed: number } {
  if (Array.isArray(v)) {
    let removed = 0;
    const arr = v.map(item => {
      const r = neutralizeImages(item);
      removed += r.removed;
      return r.value;
    });
    return { value: arr, removed };
  }
  if (v && typeof v === 'object') {
    if ((v as Block).type === 'image') {
      return { value: { ...PLACEHOLDER }, removed: 1 };
    }
    let removed = 0;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const r = neutralizeImages(val);
      removed += r.removed;
      out[k] = r.value;
    }
    return { value: out, removed };
  }
  return { value: v, removed: 0 };
}

export interface StripResult {
  /** New node with images removed. Same reference if nothing changed. */
  node: MessageNode;
  /** How many *visible* image blocks were removed from message.content.
   *  The duplicate cc keeps in toolUseResult is cleaned too but not counted
   *  here, so the number matches what the user saw on the row. */
  removed: number;
}

/**
 * Remove every image from a message: drop image blocks in message.content
 * (the API-visible content) per the placeholder rule above, and neutralise
 * the duplicate cc stores in the top-level toolUseResult field. Returns the
 * original node untouched when there is nothing to do.
 */
export function stripImages(node: MessageNode): StripResult {
  const message = (node.raw as { message?: { content?: unknown } }).message;
  const content = message?.content;

  let contentRemoved = 0;
  let nextContent: Block[] = [];

  if (Array.isArray(content)) {
    for (const block of content as Block[]) {
      if (isImage(block)) {
        contentRemoved++;
        continue; // drop it
      }
      if (block?.type === 'tool_result' && Array.isArray(block.content)) {
        const inner = block.content as Block[];
        const keptInner = inner.filter(b => !isImage(b));
        const innerRemoved = inner.length - keptInner.length;
        if (innerRemoved > 0) {
          contentRemoved += innerRemoved;
          nextContent.push({
            ...block,
            content: keptInner.length > 0 ? keptInner : [PLACEHOLDER],
          });
          continue;
        }
      }
      nextContent.push(block);
    }
    // A user turn that was only an image is now empty — keep it meaningful.
    if (contentRemoved > 0 && nextContent.length === 0) nextContent.push(PLACEHOLDER);
  }

  // cc duplicates a tool screenshot into a top-level `toolUseResult` field;
  // strip the base64 out of there too so the attachment really leaves the
  // file and a model re-reading it never sees an image.
  const tur = (node.raw as { toolUseResult?: unknown }).toolUseResult;
  const turResult = tur !== undefined
    ? neutralizeImages(tur)
    : { value: tur, removed: 0 };

  if (contentRemoved === 0 && turResult.removed === 0) return { node, removed: 0 };

  const raw = {
    ...(node.raw as Record<string, unknown>),
    ...(contentRemoved > 0
      ? { message: { ...(message as object), content: nextContent } }
      : {}),
    ...(turResult.removed > 0 ? { toolUseResult: turResult.value } : {}),
  } as MessageNode['raw'];

  return {
    node: {
      ...node,
      raw,
      imageCount: countImages((raw as { message?: { content?: unknown } }).message?.content),
    },
    removed: contentRemoved,
  };
}
