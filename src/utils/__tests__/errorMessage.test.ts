import { describe, it, expect } from 'vitest';
import {
  readApiErrorMessage,
  readStatusError,
  formatSafeErrorMessage,
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
