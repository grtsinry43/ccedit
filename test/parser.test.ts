import { describe, it, expect } from 'vitest';
import { parseJsonlFile } from '../packages/core/src/jsonl/parser.js';
import { repairMessageChain, validateChain, diagnoseChain } from '../packages/core/src/jsonl/repair.js';
import { getSideEffectSummary, getAffectedFiles } from '../packages/core/src/analyzer/tool-calls.js';
import { serializeMessages, extractMetadata, generateFullJsonl } from '../packages/core/src/jsonl/serializer.js';
import { resolve } from 'path';
import { readFileSync } from 'fs';

describe('JSONL Parser', () => {
  it('should parse test session correctly', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);

    // 应该有 15 条消息（不含 permission-mode, file-history-snapshot, last-prompt）
    expect(messages.length).toBe(15);

    // 第一条应该是用户消息
    expect(messages[0].type).toBe('user');
    expect(messages[0].role).toBe('user');
    expect(messages[0].textContent).toBe('帮我写一个登录页面');

    // 第二条应该是 assistant 消息（含 thinking）
    expect(messages[1].type).toBe('assistant');
    expect(messages[1].role).toBe('assistant');

    // 第三条应该包含 tool_use (Read)
    expect(messages[2].toolCalls.length).toBe(1);
    expect(messages[2].toolCalls[0].toolName).toBe('Read');
    expect(messages[2].toolCalls[0].toolUseId).toBe('toolu-001');

    // 检查 tool_use ↔ tool_result 映射
    const readToolCall = messages[2].toolCalls[0];
    expect(readToolCall.resultIndex).toBe(3);
    expect(readToolCall.resultOk).toBe(true);

    // 检查 Write 操作的副作用标记
    const writeMessage = messages.find(m =>
      m.toolCalls.some(tc => tc.toolName === 'Write')
    );
    expect(writeMessage).toBeDefined();
    expect(writeMessage!.hasSideEffects).toBe(true);

    // 检查 Edit 操作
    const editMessage = messages.find(m =>
      m.toolCalls.some(tc => tc.toolName === 'Edit')
    );
    expect(editMessage).toBeDefined();
    expect(editMessage!.toolCalls[0].sideEffect).toBe('file-edit');
  });
});

describe('Tool Call Analysis', () => {
  it('should generate side effect summary', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);
    const summary = getSideEffectSummary(messages);

    expect(summary.totalToolCalls).toBe(4); // Read, Write, Bash, Edit
    expect(summary.sideEffectCount).toBe(3); // Write, Bash, Edit
    expect(summary.affectedFiles.length).toBeGreaterThan(0);
  });

  it('should extract affected files', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);
    const files = getAffectedFiles(messages);

    expect(files).toContain('/src/App.tsx');
    expect(files).toContain('/src/Login.tsx');
  });
});

describe('Chain Repair', () => {
  it('should validate chain', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);
    const validation = validateChain(messages);

    expect(validation.isValid).toBe(true);
    expect(validation.issues.length).toBe(0);
  });

  it('should repair broken chain', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);

    // 模拟断链：删除第二条消息的 parentUuid
    const brokenMessages = [...messages];
    brokenMessages[1] = {
      ...brokenMessages[1],
      parentUuid: null,
      raw: { ...brokenMessages[1].raw, parentUuid: null }
    };

    const result = repairMessageChain(brokenMessages);

    expect(result.repairedCount).toBe(1);
    expect(result.messages[1].parentUuid).toBe(messages[0].uuid);
  });
});

describe('Serialization', () => {
  it('should extract metadata from JSONL', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const metadata = extractMetadata(filePath);

    expect(metadata.permissionMode).toBeDefined();
    expect(metadata.permissionMode!.type).toBe('permission-mode');
    expect(metadata.fileHistorySnapshot).toBeDefined();
    expect(metadata.fileHistorySnapshot!.type).toBe('file-history-snapshot');
  });

  it('should serialize messages correctly', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);
    const serialized = serializeMessages(messages);

    // 验证序列化后的格式
    const lines = serialized.split('\n').filter(line => line.trim());
    expect(lines.length).toBe(15);

    // 验证每行都是有效的 JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('should generate full JSONL with metadata', () => {
    const filePath = resolve(__dirname, '../test/fixtures/test-session.jsonl');
    const messages = parseJsonlFile(filePath);
    const metadata = extractMetadata(filePath);
    const fullJsonl = generateFullJsonl(messages, metadata, 'test-session');

    const lines = fullJsonl.split('\n').filter(line => line.trim());

    // 应该有: permission-mode + file-history-snapshot + 15 messages + last-prompt = 18 行
    expect(lines.length).toBe(18);

    // 第一行应该是 permission-mode
    const firstLine = JSON.parse(lines[0]);
    expect(firstLine.type).toBe('permission-mode');

    // 最后一行应该是 last-prompt
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine.type).toBe('last-prompt');
    expect(lastLine.leafUuid).toBe(messages[messages.length - 1].uuid);
  });
});
