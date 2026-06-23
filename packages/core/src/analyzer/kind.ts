/**
 * kind — classifier for a JSONL message's semantic role.
 *
 * cc itself uses an ad-hoc discriminator at every call site
 * (`isHumanTurn`, `isToolResultMessage`, `isMeta`, …) which is
 * correct but easy to get wrong. ccedit centralises that logic
 * into a single `MessageKind` so the editor can present one
 * "what is this row" answer to the user and gate destructive
 * actions on it.
 *
 * Hard-block kinds can never be deleted; non-editable kinds can
 * never be edited. The mapping is intentionally conservative —
 * when in doubt, deny.
 */
import type { RawMessage } from '../types.js';

export type MessageKind =
  // Transcript messages (cc calls these "transcript messages"; they
  // participate in the parentUuid chain).
  | 'human'                 // real user prompt
  | 'assistant-text'        // assistant with text/thinking only
  | 'assistant-with-tools' // assistant that issued tool_use blocks
  | 'tool-result'           // type:'user' but content[0] is tool_result
  | 'meta-injection'        // isMeta:true (system reminders, IDE context, …)
  | 'system'                // type:'system' (api_error, turn_duration, local_command, …)
  | 'compact-boundary'      // system subtype:'compact_boundary' — preserved as a divider
  | 'attachment'            // type:'attachment' (hook_*, IDE notification, teleport)
  // Sidechain (subagent) transcripts — cc sets isSidechain:true on them.
  | 'sidechain-human'
  | 'sidechain-assistant'
  // Ephemeral — cc deliberately excludes these from the chain.
  | 'progress'              // type:'progress' (bash_progress, hook_progress, etc.)
  // Everything else is metadata, even if cc would put it in the chain.
  | 'metadata';

/**
 * Non-transcript JSONL line types. These rows never participate in
 * the conversation chain; the editor must preserve them verbatim on
 * save, and they cannot be edited or deleted from inside the editor.
 */
const METADATA_TYPES = new Set([
  'permission-mode',
  'file-history-snapshot',
  'last-prompt',
  'summary',
  'custom-title',
  'ai-title',
  'task-summary',
  'tag',
  'agent-name',
  'agent-color',
  'agent-setting',
  'pr-link',
  'attribution-snapshot',
  'content-replacement',
  'queue-operation',
  'speculation-accept',
  'mode',
  'worktree-state',
  'marble-origami-commit',
  'marble-origami-snapshot',
]);

/**
 * Inspect raw.message.content[0] without trusting it is shaped right.
 * cc sometimes emits content as a string (for plain user prompts) and
 * sometimes as an array of blocks; we accept both.
 */
function contentBlocks(raw: RawMessage): Array<{ type?: string; [k: string]: unknown }> {
  const c = (raw as { message?: { content?: unknown } }).message?.content;
  if (Array.isArray(c)) return c as Array<{ type?: string }>;
  return [];
}

function isSidechain(raw: RawMessage): boolean {
  return (raw as { isSidechain?: boolean }).isSidechain === true;
}

function isMetaInjection(raw: RawMessage): boolean {
  return (raw as { isMeta?: true }).isMeta === true;
}

export function classify(raw: RawMessage): MessageKind {
  const t = (raw as { type?: string }).type;

  if (!t) return 'metadata';
  if (METADATA_TYPES.has(t)) return 'metadata';
  if (t === 'progress') return 'progress';
  if (t === 'attachment') return 'attachment';

  if (t === 'system') {
    const sub = (raw as { subtype?: string }).subtype;
    return sub === 'compact_boundary' || sub === 'microcompact_boundary'
      ? 'compact-boundary'
      : 'system';
  }

  if (t === 'user') {
    if (isMetaInjection(raw)) return 'meta-injection';
    const blocks = contentBlocks(raw);
    if (blocks.some(b => b?.type === 'tool_result')) return 'tool-result';
    return isSidechain(raw) ? 'sidechain-human' : 'human';
  }

  if (t === 'assistant') {
    const blocks = contentBlocks(raw);
    const hasTools = blocks.some(b => b?.type === 'tool_use');
    if (isSidechain(raw)) {
      return hasTools ? 'sidechain-assistant' : 'sidechain-assistant';
    }
    return hasTools ? 'assistant-with-tools' : 'assistant-text';
  }

  // Unknown / future type — treat as metadata so we never let the
  // editor wreck something the runtime has not yet taught us about.
  return 'metadata';
}

/**
 * Kinds that must never be deleted. The editor hides them from the
 * selection set and rejects D / Ctrl-A on them.
 */
export const HARD_BLOCK: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'metadata',
  'progress',
  'attachment',
  'system',
  'compact-boundary',
  'meta-injection',
  'sidechain-human',
  'sidechain-assistant',
]);

/**
 * Kinds that must never be edited. `tool-result` is in this set because
 * changing a tool result lies to the model about what the tool returned.
 * `assistant-with-tools` is in this set because rewriting the text
 * block without also re-issuing the tool call produces a state cc has
 * never seen (an assistant that "said X then ran tool Y but the text
 * was actually Z"). The pair manager can still delete it (after
 * warning), just not edit it.
 */
export const NO_EDIT: ReadonlySet<MessageKind> = new Set<MessageKind>([
  'metadata',
  'progress',
  'attachment',
  'system',
  'compact-boundary',
  'meta-injection',
  'tool-result',
  'assistant-with-tools',
  'sidechain-human',
  'sidechain-assistant',
]);

export function canDelete(kind: MessageKind): boolean {
  return !HARD_BLOCK.has(kind);
}
export function canEdit(kind: MessageKind): boolean {
  return !NO_EDIT.has(kind);
}
export function isTranscriptMessage(kind: MessageKind): boolean {
  // cc's `isTranscriptMessage` keeps user/assistant/attachment/system.
  // For the editor we want the same set PLUS sidechain (which is
  // transcript-shaped) but NOT progress / metadata. isMeta:true user
  // messages participate in the chain (cc merges them with the next
  // real user turn), so we keep them in the transcript too.
  if (kind === 'progress' || kind === 'metadata') return false;
  if (kind === 'compact-boundary' || kind === 'system' || kind === 'attachment') return true;
  if (kind === 'meta-injection') return true;
  if (kind === 'sidechain-human' || kind === 'sidechain-assistant') return true;
  return !HARD_BLOCK.has(kind);
}
