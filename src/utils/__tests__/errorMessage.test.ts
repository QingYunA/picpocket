import { describe, it, expect } from 'vitest';
import {
  readApiErrorMessage,
  readStatusError,
  formatSafeErrorMessage,
  markInsufficientCredits,
  isInsufficientCreditsMessage,
} from '../errorMessage';

describe('formatSafeErrorMessage & readApiErrorMessage', () => {
  it('正确解析标准的 API JSON 错误对象与字符串', () => {
    expect(readApiErrorMessage({ error: { message: 'Invalid API key provided' } })).toBe(
      'Invalid API key provided'
    );
    expect(readApiErrorMessage({ msg: 'Quota exhausted' })).toBe('Quota exhausted');
    expect(readApiErrorMessage('{"error":{"message":"Prompt triggered safety review"}}')).toBe(
      'Prompt triggered safety review'
    );
  });

  it('100% 拦截并清洗 Cloudflare 524 HTML 超时页面，转换为温和人话，不泄露任何 HTML 源码', () => {
    const cf524Html = `<!DOCTYPE html>
<html lang="en-US">
<head>
<title>aixoras.com | 524: A timeout occurred</title>
<style type="text/css">
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen; }
.text-red { color: #f00; }
</style>
</head>
<body>
<h1>Error 524 Ray ID: 9de489a23b &bull; 2026-09-21 15:33:23 UTC</h1>
<h2>A timeout occurred</h2>
<p>The origin web server timed out responding to this request.</p>
</body>
</html>`;

    const result = formatSafeErrorMessage(cf524Html, 524);
    expect(result).not.toContain('<html');
    expect(result).not.toContain('<!DOCTYPE');
    expect(result).not.toContain('<style');
    expect(result).not.toContain('</h1>');
    expect(result).toMatch(/超时/);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('100% 拦截并清洗 Nginx 413 HTML 错误页，转换为参考图体积人话提示', () => {
    const nginx413Html = `<html>
<head><title>413 Request Entity Too Large</title></head>
<body bgcolor="white">
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.26.1</center>
</body>
</html>`;

    const result = formatSafeErrorMessage(nginx413Html, 413);
    expect(result).not.toContain('<html>');
    expect(result).not.toContain('<center>');
    expect(result).not.toContain('nginx');
    expect(result).toMatch(/参考图体积超出/);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('正确处理 502, 504, 401, 429 等状态码', () => {
    expect(readStatusError(401, 'fallback')).toContain('鉴权失败或额度不足');
    expect(readStatusError(429, 'fallback')).toContain('限流');
    expect(readStatusError(502, 'fallback')).toContain('网关错误（502）');
    expect(readStatusError(504, 'fallback')).toContain('网关超时（504）');
  });

  it('强行将超长错误文本截断在 100 字符内，绝不撑爆 UI', () => {
    const longText = 'A'.repeat(500);
    const result = formatSafeErrorMessage(longText);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('积分不足标记 (insufficient credits marker)', () => {
  it('标记后的消息可被识别，且中英文文案都不影响判定', () => {
    expect(isInsufficientCreditsMessage(markInsufficientCredits('积分不足：当前余额 3，本次需要 8'))).toBe(true);
    expect(isInsufficientCreditsMessage(markInsufficientCredits('Not enough credits: balance 3, need 8'))).toBe(true);
  });

  it('未标记的消息、空值与非字符串一律不算积分不足', () => {
    expect(isInsufficientCreditsMessage('积分不足：当前余额 3')).toBe(false);
    expect(isInsufficientCreditsMessage('请求太频繁，请稍后再试')).toBe(false);
    expect(isInsufficientCreditsMessage('')).toBe(false);
    expect(isInsufficientCreditsMessage(undefined)).toBe(false);
    expect(isInsufficientCreditsMessage(null)).toBe(false);
    expect(isInsufficientCreditsMessage({ message: 'x' })).toBe(false);
  });

  it('标记不改变可见文案，并能穿过 formatSafeErrorMessage 的清洗与截断', () => {
    const marked = markInsufficientCredits('积分不足：当前余额 3，本次需要 8');
    expect(marked.replace(/\u2063/g, '')).toBe('积分不足：当前余额 3，本次需要 8');
    expect(isInsufficientCreditsMessage(formatSafeErrorMessage(marked))).toBe(true);
    const long = markInsufficientCredits('积分不足'.repeat(60));
    const cleaned = formatSafeErrorMessage(long);
    expect(cleaned.length).toBeLessThanOrEqual(100);
    expect(isInsufficientCreditsMessage(cleaned)).toBe(true);
  });

  it('经 String(err) 与 Error.message 往返后仍可识别（IPC 序列化场景）', () => {
    const err = new Error(markInsufficientCredits('积分不足'));
    expect(isInsufficientCreditsMessage(String(err))).toBe(true);
    expect(isInsufficientCreditsMessage(err.message)).toBe(true);
  });
});
