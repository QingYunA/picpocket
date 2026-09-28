/** ZIP 完整备份的清单版本：v1 缺少图库元数据与设置，v2 起完整可恢复 */
export const BACKUP_MANIFEST_VERSION = 2;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

export function extensionForMime(mime: string | undefined): string {
  return (mime && EXT_BY_MIME[mime.toLowerCase()]) || 'png';
}

export function mimeFromDataUrl(dataUrl: string): string | undefined {
  return dataUrl.match(/^data:([^;,]+)/)?.[1];
}

/** 按文件头识别图片类型；旧备份把所有图片都命名为 .png，扩展名不可信 */
export function sniffImageMime(bytes: Uint8Array): string {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(4, 4) === 'ftyp' && ascii(8, 4).startsWith('avi')) return 'image/avif';
  if (/^\s*<(\?xml|svg)/i.test(ascii(0, 64))) return 'image/svg+xml';
  return 'image/png';
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
