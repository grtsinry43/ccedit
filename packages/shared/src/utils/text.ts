/**
 * 截断文本到指定长度
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 生成消息摘要
 */
export function generateSummary(text: string, maxLength: number = 50): string {
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return truncateText(cleanText, maxLength);
}
