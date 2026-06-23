import { MessageNode } from '../types.js';

export interface ChainRepairResult {
  messages: MessageNode[];
  repairedCount: number;
  orphanCount: number;
  issues: string[];
}

/**
 * 验证消息链条的连贯性
 */
export function validateChain(messages: MessageNode[]): {
  isValid: boolean;
  issues: string[];
  orphans: MessageNode[];
} {
  const issues: string[] = [];
  const orphans: MessageNode[] = [];
  const uuidSet = new Set(messages.map(m => m.uuid));

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg.parentUuid) {
      issues.push(`Message ${i} (uuid: ${msg.uuid}) has no parentUuid`);
      orphans.push(msg);
    } else if (!uuidSet.has(msg.parentUuid)) {
      issues.push(`Message ${i} (uuid: ${msg.uuid}) references non-existent parent: ${msg.parentUuid}`);
      orphans.push(msg);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    orphans
  };
}

/**
 * 修复消息链条（parentUuid）
 */
export function repairMessageChain(messages: MessageNode[]): ChainRepairResult {
  if (messages.length === 0) {
    return { messages: [], repairedCount: 0, orphanCount: 0, issues: [] };
  }

  const result = [...messages];
  const issues: string[] = [];
  let repairedCount = 0;

  // 第一遍：验证并修复 parentUuid 链条
  for (let i = 1; i < result.length; i++) {
    const msg = result[i];

    if (!msg.parentUuid || !result.find(m => m.uuid === msg.parentUuid)) {
      const oldParent = msg.parentUuid;
      msg.parentUuid = result[i - 1].uuid;
      msg.raw.parentUuid = result[i - 1].uuid;
      repairedCount++;

      issues.push(
        `Repaired message ${i} (uuid: ${msg.uuid}): ` +
        `parent changed from ${oldParent || 'null'} to ${result[i - 1].uuid}`
      );
    }
  }

  return {
    messages: result,
    repairedCount,
    orphanCount: result.filter((m, i) => i > 0 && !m.parentUuid).length,
    issues
  };
}

/**
 * 处理删除区间后的链条重连
 */
export function reconnectChainAfterDeletion(
  messages: MessageNode[],
  deletedIndices: Set<number>
): MessageNode[] {
  const result = messages.filter((_, i) => !deletedIndices.has(i));

  // 重建 parentUuid 关系
  return repairMessageChain(result).messages;
}

/**
 * 更新 leafUuid（最后一条消息的 UUID）
 */
export function updateLeafUuid(messages: MessageNode[]): string | null {
  if (messages.length === 0) return null;
  return messages[messages.length - 1].uuid;
}

/**
 * 生成链条诊断报告
 */
export function diagnoseChain(messages: MessageNode[]): string {
  const validation = validateChain(messages);

  if (validation.isValid) {
    return 'Chain is valid and consistent.';
  }

  const lines = [
    `Chain has ${validation.issues.length} issue(s):`,
    ...validation.issues.map(issue => `  - ${issue}`),
    '',
    `Orphan messages: ${validation.orphans.length}`
  ];

  return lines.join('\n');
}
