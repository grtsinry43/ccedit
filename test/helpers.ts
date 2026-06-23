/**
 * Shared test helpers. Lives in test/ so it can be imported by other
 * test files without contaminating the packages/ source tree.
 */
import type { MessageNode, RawMessage } from '../packages/core/src/types.js';
import { classify } from '../packages/core/src/analyzer/kind.js';
import { countImages } from '../packages/core/src/analyzer/image-strip.js';

/**
 * Convert a raw JSONL line into a MessageNode. The kind is computed
 * from the raw so callers can use a real classify() result in tests
 * that exercise the metadata / system lines that parseJsonlFile()
 * intentionally omits.
 */
export function toMessageNode(raw: RawMessage, index: number): MessageNode {
  return {
    index,
    raw,
    uuid: (raw as { uuid?: string }).uuid || `auto-${raw.type}-${index}`,
    parentUuid: (raw as { parentUuid?: string | null }).parentUuid || null,
    type: raw.type,
    role: 'other',
    textContent: '',
    toolCalls: [],
    selected: false,
    hasSideEffects: false,
    imageCount: countImages(raw.message?.content),
    kind: classify(raw),
  };
}
