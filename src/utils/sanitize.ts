/**
 * Sanitizes an API key or token before placing it in HTTP headers.
 * Web Fetch / XHR throws:
 * "Failed to execute 'fetch' on 'Window': Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point"
 * if any header value contains characters with code point > 255 (e.g. Chinese characters, full-width punctuation, Unicode spaces).
 */
export function sanitizeHttpHeaderToken(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // 1. 去除常见的 "Bearer " 前缀（用户从文档复制时的常见习惯）
  cleaned = cleaned.replace(/^bearer\s+/i, '');

  // 2. 如果包含中文字符或描述性文字，优先提取连续的标准 token 字符串（支持字母、数字、下划线、短横线、点）
  const tokenMatch = cleaned.match(/([a-zA-Z0-9_\-\.]{10,})/);
  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1].trim();
  }

  // 3. 彻底剔除所有非可打印 ASCII 字符与控制字符 (\x21-\x7E 是标准可打印 ASCII)
  return cleaned.replace(/[^\x21-\x7E]/g, '').trim();
}

/**
 * Sanitizes an HTTP(S) Base URL by stripping non-ASCII characters and trailing slashes.
 */
export function sanitizeHttpUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/[^\x21-\x7E]/g, '')
    .replace(/\/+$/, '')
    .trim();
}
