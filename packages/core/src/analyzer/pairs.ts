/**
 * pairs — tool_use ↔ tool_result pairing and delete planning.
 *
 * cc maintains the pair implicitly via the assistant `tool_use.id`
 * field and the user `tool_result.tool_use_id` field. A safe editor
 * has to model this explicitly so that:
 *
 *   1. The user can see, for every tool_use, whether its result is
 *      still present (and vice versa).
 *   2. Selecting a tool_use auto-includes its tool_result, and
 *      selecting a tool_result leaves its tool_use behind as an
 *      orphan (with a warning) rather than silently severing the
 *      link.
 *
 * `planDelete` is the only sanctioned way to translate a set of
 * user-selected uuids into a set of uuids to actually remove. The
 * editor MUST go through this — ad-hoc `filter` calls are how
 * the previous version of ccedit broke chains.
 */
import type { MessageNode } from '../types.js';
import { canDelete, type MessageKind } from './kind.js';

export interface Pair {
  /** Uuid of the assistant message that issued the tool_use. */
  toolUseUuid: string;
  /** Uuid of the user message whose first block is a tool_result. */
  toolResultUuid: string | null;
}

export interface PairingMap {
  byToolUse: Map<string, Pair>;
  byToolResult: Map<string, Pair>;
}

export function buildPairs(messages: MessageNode[]): PairingMap {
  const byToolUse = new Map<string, Pair>();
  const byToolResult = new Map<string, Pair>();
  for (const m of messages) {
    if (m.kind === 'assistant-with-tools' || m.kind === 'sidechain-assistant') {
      for (const tc of m.toolCalls) {
        const pair: Pair = { toolUseUuid: m.uuid, toolResultUuid: null };
        byToolUse.set(tc.toolUseId, pair);
        byToolResult.set(m.uuid, pair); // key by tool_use message uuid
      }
    } else if (m.kind === 'tool-result') {
      const blocks = ((m.raw as { message?: { content?: unknown } }).message?.content) as
        | Array<{ type?: string; tool_use_id?: string }>
        | undefined;
      const block = Array.isArray(blocks) ? blocks.find(b => b?.type === 'tool_result') : undefined;
      const id = block?.tool_use_id;
      if (!id) continue;
      let pair = byToolUse.get(id);
      if (!pair) {
        // The tool_use message is missing or filtered out — record
        // an orphan pair so the UI can warn the user.
        pair = { toolUseUuid: '', toolResultUuid: m.uuid };
        byToolUse.set(id, pair);
      } else {
        pair.toolResultUuid = m.uuid;
        // Also record under the tool_result uuid for symmetry.
      }
      byToolResult.set(m.uuid, pair);
      // Cross-link by tool_use_id so the editor can resolve in either direction.
      byToolResult.set(id, pair);
    }
  }
  return { byToolUse, byToolResult };
}

export interface DeletePlan {
  /** True if every selected message is deletable. */
  allowed: boolean;
  /** Selected messages that cannot be deleted (hard-block). */
  blocked: Array<{ uuid: string; kind: MessageKind; reason: string }>;
  /** Uuids that the editor will actually remove. Includes auto-paired. */
  toDelete: Set<string>;
  /**
   * Uuids pulled into `toDelete` by pairing that the user did NOT select
   * directly — the partner half (and siblings) of a tool_use ↔ tool_result
   * pair. The UI lists these so the user knows the deletion is atomic over
   * the whole tool exchange before committing.
   */
  autoAdded: Set<string>;
  /**
   * Genuinely unresolvable warnings — currently only a tool_result whose
   * tool_use is already missing from the file (deleting it just clears a
   * pre-existing dangling result). Kept for the UI to surface if non-empty.
   */
  orphanWarnings: string[];
}

function reason(kind: MessageKind): string {
  switch (kind) {
    case 'metadata': return 'structural metadata — preserved by the editor';
    case 'progress': return 'ephemeral UI state — never persisted to chain';
    case 'attachment': return 'hook / IDE attachment — runtime-managed';
    case 'system': return 'system message (api_error / local_command / …) — runtime-managed';
    case 'compact-boundary': return 'compact boundary — required for resume';
    case 'meta-injection': return 'injected meta (system reminder, IDE context) — managed by runtime';
    case 'sidechain-human':
    case 'sidechain-assistant': return 'sidechain (subagent) transcript — preserved';
    default: return 'not deletable';
  }
}

/**
 * `selected` is the user's raw set. `messages` is the full list. The
 * returned `toDelete` is the set the editor should actually apply.
 */
export function planDelete(
  selected: Set<string>,
  messages: MessageNode[],
  pairing: PairingMap,
): DeletePlan {
  const blocked: DeletePlan['blocked'] = [];
  const toDelete = new Set<string>();
  const orphanWarnings: string[] = [];

  // Index for O(1) lookups.
  const byUuid = new Map(messages.map(m => [m.uuid, m]));

  // Phase 1: classify every selection.
  for (const uuid of selected) {
    const m = byUuid.get(uuid);
    if (!m) continue;
    if (!canDelete(m.kind)) {
      blocked.push({ uuid, kind: m.kind, reason: reason(m.kind) });
      continue;
    }
    toDelete.add(uuid);
  }

  // Phase 2: cascade over tool_use ↔ tool_result pairs until fixpoint, so
  // the deletion is atomic over the whole tool exchange. Deleting an
  // assistant tool_use pulls every one of its tool_results; deleting a
  // tool_result pulls its assistant tool_use, which in turn pulls that
  // assistant's other results. This guarantees no orphaned half — which
  // would make `claude --resume` reject the session — survives the delete.
  const queue: string[] = Array.from(toDelete);
  while (queue.length > 0) {
    const uuid = queue.pop()!;
    const m = byUuid.get(uuid);
    if (!m) continue;

    if (m.kind === 'assistant-with-tools' || m.kind === 'sidechain-assistant') {
      for (const tc of m.toolCalls) {
        const pair = pairing.byToolUse.get(tc.toolUseId);
        const tr = pair?.toolResultUuid ? byUuid.get(pair.toolResultUuid) : undefined;
        if (tr && canDelete(tr.kind) && !toDelete.has(tr.uuid)) {
          toDelete.add(tr.uuid);
          queue.push(tr.uuid);
        }
      }
    } else if (m.kind === 'tool-result') {
      const id = toolUseIdOf(m);
      const pair = id ? pairing.byToolUse.get(id) : undefined;
      const tu = pair?.toolUseUuid ? byUuid.get(pair.toolUseUuid) : undefined;
      if (tu && canDelete(tu.kind) && !toDelete.has(tu.uuid)) {
        toDelete.add(tu.uuid);
        queue.push(tu.uuid);
      }
    }
  }

  // Phase 3: report what was pulled in beyond the user's own picks, plus
  // any tool_result whose tool_use is already gone from the file (deleting
  // it just clears a pre-existing dangling result — no partner to pull).
  const autoAdded = new Set<string>();
  for (const uuid of toDelete) if (!selected.has(uuid)) autoAdded.add(uuid);

  for (const uuid of toDelete) {
    const m = byUuid.get(uuid);
    if (m?.kind !== 'tool-result') continue;
    const id = toolUseIdOf(m);
    const pair = id ? pairing.byToolUse.get(id) : undefined;
    if (pair && !pair.toolUseUuid) {
      orphanWarnings.push(`tool_result ${uuid} has no tool_use in this session`);
    }
  }

  return {
    allowed: blocked.length === 0,
    blocked,
    toDelete,
    autoAdded,
    orphanWarnings,
  };
}

/** Read the `tool_use_id` off a tool-result message's tool_result block. */
function toolUseIdOf(m: MessageNode): string | undefined {
  const blocks = ((m.raw as { message?: { content?: unknown } }).message?.content) as
    | Array<{ type?: string; tool_use_id?: string }>
    | undefined;
  const block = Array.isArray(blocks) ? blocks.find(b => b?.type === 'tool_result') : undefined;
  return block?.tool_use_id;
}
