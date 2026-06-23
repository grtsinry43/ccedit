/** JSONL 中的原始消息（保持原样写回） */
export interface RawMessage {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  [key: string]: unknown;
}

/** 内容块类型 */
export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result';
  [key: string]: unknown;
}

/** 解析后的消息节点（编辑器内部使用） */
export interface MessageNode {
  index: number;
  raw: RawMessage;
  uuid: string;
  parentUuid: string | null;
  type: string;
  role: 'user' | 'assistant' | 'system' | 'other';
  textContent: string;
  timestamp?: string;
  toolCalls: ToolCallInfo[];
  selected: boolean;
  hasSideEffects: boolean;
  /**
   * Number of `image` blocks reachable from this message — both top-level
   * (pasted into a user prompt) and nested inside a tool_result's content
   * (a screenshot a tool returned). Computed once during parse; the editor
   * uses it to mark image-bearing rows and to gate the strip action.
   */
  imageCount: number;
  /**
   * Classified semantic role of the message. Computed once during parse;
   * the editor treats this as the single source of truth for "can this be
   * deleted / edited" and for visual glyphs.
   */
  kind: import('./analyzer/kind.js').MessageKind;
  /** Uuid of the paired message (tool_use ↔ tool_result), if any. */
  pairedWith?: string;
  /** True if the pair partner was already missing or severed by an edit. */
  isOrphan?: boolean;
}

/** 工具调用信息 */
export interface ToolCallInfo {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  resultIndex: number | null;
  resultOk: boolean | null;
  resultContent: string;
  sideEffect: 'none' | 'file-write' | 'file-edit' | 'bash-write' | 'bash-read-only' | 'unknown';
  affectedFile?: string;
}
