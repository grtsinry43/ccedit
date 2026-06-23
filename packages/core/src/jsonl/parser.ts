import { readFileSync } from 'fs';
import { RawMessage, MessageNode, ToolCallInfo } from '../types.js';
import { classify, isTranscriptMessage, type MessageKind } from '../analyzer/kind.js';
import { countImages } from '../analyzer/image-strip.js';

/**
 * 解析 JSONL 文件为消息数组
 */
export function parseJsonlFile(filePath: string): MessageNode[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const messages: MessageNode[] = [];
  const toolUseMap = new Map<string, { messageIndex: number; toolIndex: number }>();

  // 第一遍：解析所有消息。Metadata / progress 行不入 messages 数组——它们
  // 走 readMetadataLines 这条独立通道,serializer 写回时也不会和
  // transcript 行混在一起重复。这是上一版重复 last-prompt 行的根因。
  for (let i = 0; i < lines.length; i++) {
    try {
      const raw: RawMessage = JSON.parse(lines[i]);
      const kind = classify(raw);
      if (!isTranscriptMessage(kind)) continue;
      const message = parseRawMessage(raw, i, kind);
      if (message) {
        messages.push(message);

        // 记录 tool_use 的位置（使用 message 在 messages 数组中的索引）
        const messageIndex = messages.length - 1;
        message.toolCalls.forEach((tc, toolIndex) => {
          toolUseMap.set(tc.toolUseId, { messageIndex, toolIndex });
        });
      }
    } catch (e) {
      console.warn(`Warning: Failed to parse line ${i + 1}`);
    }
  }

  // 第二遍：建立 tool_use ↔ tool_result 映射
  linkToolResults(messages, toolUseMap);

  return messages;
}

/**
 * 建立 tool_use ↔ tool_result 的映射关系
 */
function linkToolResults(messages: MessageNode[], toolUseMap: Map<string, { messageIndex: number; toolIndex: number }>) {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.type !== 'user' || !message.raw.message?.content || !Array.isArray(message.raw.message.content)) {
      continue;
    }

    for (const block of message.raw.message.content) {
      if (
        block &&
        typeof block === 'object' &&
        block.type === 'tool_result' &&
        'tool_use_id' in block
      ) {
        const toolUseId = (block as any).tool_use_id;
        const location = toolUseMap.get(toolUseId);

        if (location) {
          const toolCall = messages[location.messageIndex].toolCalls[location.toolIndex];
          toolCall.resultIndex = i;  // 使用 messages 数组的索引
          toolCall.resultOk = !(block as any).is_error;
          toolCall.resultContent = typeof (block as any).content === 'string'
            ? (block as any).content.slice(0, 100)
            : '';
          // Cross-link the two messages by uuid so the editor can render
          // the pair glyph and the delete planner can auto-extend.
          const tu = messages[location.messageIndex];
          tu.pairedWith = message.uuid;
          message.pairedWith = tu.uuid;
        } else {
          // Tool_use not found — the result is an orphan. Mark it so the
          // UI can show a warning glyph.
          message.isOrphan = true;
        }
      }
    }
  }
}

/**
 * 解析单个原始消息
 */
function parseRawMessage(raw: RawMessage, index: number, kind: MessageKind): MessageNode | null {
  if (!raw.type) {
    return null;
  }

  // 为无 uuid 的消息类型生成临时 uuid
  const uuid = raw.uuid || `auto-${raw.type}-${index}`;

  const toolCalls = extractToolCallsFromRaw(raw);

  return {
    index,
    raw,
    uuid,
    parentUuid: raw.parentUuid || null,
    type: raw.type,
    role: determineRole(raw),
    textContent: extractTextContent(raw),
    timestamp: raw.timestamp,
    toolCalls,
    selected: false,
    hasSideEffects: toolCalls.some(tc =>
      tc.sideEffect === 'file-write' ||
      tc.sideEffect === 'file-edit' ||
      tc.sideEffect === 'bash-write'
    ),
    imageCount: countImages(raw.message?.content),
    kind,
  };
}

/**
 * 从原始消息中提取工具调用
 */
function extractToolCallsFromRaw(raw: RawMessage): ToolCallInfo[] {
  if (raw.type !== 'assistant' || !raw.message?.content || !Array.isArray(raw.message.content)) {
    return [];
  }

  const toolCalls: ToolCallInfo[] = [];

  for (const block of raw.message.content) {
    if (block.type === 'tool_use' && 'id' in block && 'name' in block) {
      toolCalls.push({
        toolUseId: (block as any).id,
        toolName: (block as any).name,
        input: (block as any).input || {},
        resultIndex: null,
        resultOk: null,
        resultContent: '',
        sideEffect: classifySideEffect((block as any).name, (block as any).input),
        affectedFile: extractAffectedFile((block as any).name, (block as any).input)
      });
    }
  }

  return toolCalls;
}

/**
 * 分类副作用类型
 */
function classifySideEffect(toolName: string, input: Record<string, unknown>): ToolCallInfo['sideEffect'] {
  switch (toolName) {
    case 'Write':
      return 'file-write';
    case 'Edit':
      return 'file-edit';
    case 'Bash':
      return 'unknown';
    case 'Read':
    case 'Grep':
    case 'Glob':
      return 'none';
    default:
      return 'unknown';
  }
}

/**
 * 提取受影响的文件
 */
function extractAffectedFile(toolName: string, input: Record<string, unknown>): string | undefined {
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
    return input.file_path as string;
  }
  return undefined;
}

/**
 * 确定消息角色
 */
function determineRole(raw: RawMessage): 'user' | 'assistant' | 'system' | 'other' {
  if (raw.type === 'user') return 'user';
  if (raw.type === 'assistant') return 'assistant';
  if (raw.type === 'system' || raw.type === 'attachment') return 'system';
  if (raw.type === 'permission-mode' || raw.type === 'file-history-snapshot') return 'other';
  return 'other';
}

/**
 * 提取文本内容
 */
function extractTextContent(raw: RawMessage): string {
  // 特殊消息类型的文本
  if (raw.type === 'permission-mode') {
    return `[Permission: ${(raw as any).permissionMode || 'default'}]`;
  }
  if (raw.type === 'file-history-snapshot') {
    return '[File History Snapshot]';
  }
  if (raw.type === 'last-prompt') {
    return '[Last Prompt]';
  }

  if (!raw.message?.content) {
    return raw.type || '';
  }

  const content = raw.message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b.type === 'text');
    if (textBlock && 'text' in textBlock) {
      return (textBlock as any).text;
    }
  }

  return '';
}
