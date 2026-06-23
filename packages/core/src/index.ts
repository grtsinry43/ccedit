// @ccedit/core - Core logic for Claude Code session editor
export * from './types.js';
export * from './jsonl/parser.js';
export * from './jsonl/serializer.js';
export * from './jsonl/repair.js';
export * from './analyzer/tool-calls.js';
export * from './analyzer/side-effects.js';
export * from './analyzer/bash-classifier.js';
export * from './analyzer/kind.js';
export * from './analyzer/pairs.js';
export * from './analyzer/text-edit.js';
export * from './analyzer/image-strip.js';

// Re-export specific functions for convenience
export { parseJsonlFile } from './jsonl/parser.js';
export {
  serializeMessages,
  extractMetadata,
  readMetadataLines,
  generateFullJsonl,
  createBackup,
  saveSession,
} from './jsonl/serializer.js';
export { repairMessageChain, updateLeafUuid, validateChain, reconnectChainAfterDeletion, diagnoseChain } from './jsonl/repair.js';
export { extractToolCalls, analyzeAllToolCalls, getSideEffectSummary, getAffectedFiles } from './analyzer/tool-calls.js';
export { analyzeSideEffects } from './analyzer/side-effects.js';
export { classifyBashCommand } from './analyzer/bash-classifier.js';
export { classify, canDelete, canEdit, isTranscriptMessage, HARD_BLOCK, NO_EDIT, type MessageKind } from './analyzer/kind.js';
export { buildPairs, planDelete, type Pair, type PairingMap, type DeletePlan } from './analyzer/pairs.js';
export { setMessageText } from './analyzer/text-edit.js';
export { stripImages, countImages, type StripResult } from './analyzer/image-strip.js';
