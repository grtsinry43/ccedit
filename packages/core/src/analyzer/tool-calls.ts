import { RawMessage, MessageNode, ToolCallInfo } from '../types.js';
import { classifyBashCommand } from './bash-classifier.js';

/**
 * 解析消息中的工具调用
 */
export function extractToolCalls(raw: RawMessage): ToolCallInfo[] {
  if (raw.type !== 'assistant' || !raw.message?.content || !Array.isArray(raw.message.content)) {
    return [];
  }

  const toolCalls: ToolCallInfo[] = [];

  for (const block of raw.message.content) {
    if (block.type === 'tool_use') {
      const toolName = (block as any).name;
      const input = (block as any).input || {};

      toolCalls.push({
        toolUseId: (block as any).id,
        toolName,
        input,
        resultIndex: null,
        resultOk: null,
        resultContent: '',
        sideEffect: classifySideEffect(toolName, input),
        affectedFile: extractAffectedFile(toolName, input)
      });
    }
  }

  return toolCalls;
}

/**
 * 分析消息数组中的所有工具调用
 */
export function analyzeAllToolCalls(messages: MessageNode[]): Map<string, ToolCallInfo[]> {
  const result = new Map<string, ToolCallInfo[]>();

  for (const message of messages) {
    if (message.toolCalls.length > 0) {
      result.set(message.uuid, message.toolCalls);
    }
  }

  return result;
}

/**
 * 获取副作用摘要
 */
export function getSideEffectSummary(messages: MessageNode[]): {
  totalToolCalls: number;
  sideEffectCount: number;
  affectedFiles: string[];
  toolBreakdown: Record<string, number>;
} {
  let totalToolCalls = 0;
  let sideEffectCount = 0;
  const affectedFiles = new Set<string>();
  const toolBreakdown: Record<string, number> = {};

  for (const message of messages) {
    for (const tc of message.toolCalls) {
      totalToolCalls++;

      toolBreakdown[tc.toolName] = (toolBreakdown[tc.toolName] || 0) + 1;

      if (tc.sideEffect !== 'none') {
        sideEffectCount++;
      }

      if (tc.affectedFile) {
        affectedFiles.add(tc.affectedFile);
      }
    }
  }

  return {
    totalToolCalls,
    sideEffectCount,
    affectedFiles: Array.from(affectedFiles),
    toolBreakdown
  };
}

/**
 * 获取所有受影响的文件
 */
export function getAffectedFiles(messages: MessageNode[]): string[] {
  const files = new Set<string>();

  for (const message of messages) {
    for (const tc of message.toolCalls) {
      if (tc.affectedFile) {
        files.add(tc.affectedFile);
      }
    }
  }

  return Array.from(files);
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
      return classifyBashCommand((input.command as string) || '') === 'read-only'
        ? 'bash-read-only'
        : 'bash-write';
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
