import { ToolCallInfo } from '../types.js';

/**
 * 分析工具调用的副作用
 */
export function analyzeSideEffects(toolCalls: ToolCallInfo[]): boolean {
  return toolCalls.some(tc =>
    tc.sideEffect === 'file-write' ||
    tc.sideEffect === 'file-edit' ||
    tc.sideEffect === 'bash-write'
  );
}
