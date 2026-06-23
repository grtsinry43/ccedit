import { join } from 'path';
import { homedir } from 'os';

/**
 * 获取 Claude Code 配置目录
 */
export function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/**
 * 获取项目会话目录
 */
export function getProjectSessionDir(projectPath: string): string {
  const encodedPath = projectPath.replace(/\//g, '-');
  return join(getClaudeConfigDir(), 'projects', encodedPath);
}

/**
 * 解析会话文件路径
 */
export function resolveSessionPath(input: string): string {
  if (input.endsWith('.jsonl')) {
    return input;
  }
  return join(getProjectSessionDir(process.cwd()), `${input}.jsonl`);
}
