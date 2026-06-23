/**
 * text-edit — safe text mutation of a MessageNode.
 *
 * cc represents assistant content as a heterogeneous block array
 * (thinking / text / tool_use / image). A naive "replace content with
 * this string" turns an assistant message into a user-shaped one and
 * breaks resume. This module enforces the right shape per kind:
 *
 *   - human: replace text content, keep tool_result blocks (if any)
 *   - assistant-text: replace the FIRST text block, preserve thinking
 *   - assistant-with-tools: refused (callers must check `canEdit` first)
 *   - everything else: refused
 *
 * The function returns a NEW node; the raw.original is not mutated.
 * The top-level `textContent` is also recomputed so list previews stay
 * in sync with what is on disk.
 */
import type { MessageNode } from '../types.js';
import { canEdit, type MessageKind } from './kind.js';

interface TextLikeBlock {
  type?: string;
  text?: string;
  [k: string]: unknown;
}

function contentOf(node: MessageNode): string | TextLikeBlock[] | undefined {
  return (node.raw as { message?: { content?: string | TextLikeBlock[] } }).message?.content;
}

function setContent(node: MessageNode, next: string | TextLikeBlock[]): MessageNode {
  const raw = {
    ...node.raw,
    message: {
      ...(node.raw as { message?: object }).message,
      content: next,
    },
  } as MessageNode['raw'];
  return { ...node, raw };
}

function previewOf(content: string | TextLikeBlock[] | undefined): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const block = content.find(b => b?.type === 'text' && typeof b.text === 'string');
    return (block?.text as string) ?? '';
  }
  return '';
}

export function setMessageText(node: MessageNode, newText: string): MessageNode {
  if (!canEdit(node.kind)) {
    throw new Error(`cannot edit ${node.kind as MessageKind} (uuid ${node.uuid})`);
  }

  if (node.kind === 'human') {
    const content = contentOf(node);
    if (typeof content === 'string') {
      const next = setContent(node, newText);
      return { ...next, textContent: newText };
    }
    if (Array.isArray(content)) {
      const next = content.slice();
      const i = next.findIndex(b => b?.type === 'text');
      if (i >= 0) next[i] = { ...next[i], text: newText };
      else next.unshift({ type: 'text', text: newText });
      const out = setContent(node, next);
      return { ...out, textContent: newText };
    }
    const next = setContent(node, newText);
    return { ...next, textContent: newText };
  }

  if (node.kind === 'assistant-text') {
    const content = contentOf(node);
    const blocks: TextLikeBlock[] = Array.isArray(content) ? content.slice() : [];
    const i = blocks.findIndex(b => b?.type === 'text');
    if (i >= 0) {
      blocks[i] = { ...blocks[i], text: newText };
    } else {
      blocks.push({ type: 'text', text: newText });
    }
    const next = setContent(node, blocks);
    return { ...next, textContent: newText };
  }

  throw new Error(`setMessageText: unsupported kind ${node.kind as MessageKind}`);
}

