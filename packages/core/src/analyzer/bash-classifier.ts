/**
 * Bash 命令读写分类
 */
export function classifyBashCommand(command: string): 'read-only' | 'write' | 'unknown' {
  const readPatterns = [
    /\b(ls|cat|head|tail|grep|find|wc|echo|pwd|which|whoami)\b/,
    /\bgit\s+(status|log|diff|show|branch|remote)\b/,
    /\bnpm\s+(list|outdated|info)\b/,
  ];

  const writePatterns = [
    /\brm\s/, /\bmv\s/, /\bcp\s/, /\bchmod\s/, /\bchown\s/,
    /\bgit\s+(push|commit|reset|rebase|merge|checkout\s+\.)/,
    /\bnpm\s+(install|uninstall|publish)/,
    /\bdocker\s+(rm|stop|kill|exec)/,
    /\bsudo\s/,
    />\s/, />>/, /\|\s*tee\b/,
  ];

  if (readPatterns.some(p => p.test(command))) return 'read-only';
  if (writePatterns.some(p => p.test(command))) return 'write';
  return 'unknown';
}
