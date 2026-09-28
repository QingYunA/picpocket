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

/** 备份文件可能被分享或同步到网盘，凭据一律不写入 */
const SECRET_FIELDS = new Set(['apiKey', 'imageApiKey', 'authToken', 'licenseKey']);
/** 会员状态以服务端为准，从备份恢复会伪造出过期或不属于本账号的权益 */
const NON_PORTABLE_SETTINGS = new Set(['proMembership']);

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_FIELDS.has(key))
      .map(([key, v]) => [key, stripSecrets(v)])
  );
}

/** 导出用：去掉凭据与不可迁移的会员状态 */
export function toPortableSettings(settings: object): PlainObject {
  const portable = Object.fromEntries(Object.entries(settings).filter(([key]) => !NON_PORTABLE_SETTINGS.has(key)));
  return stripSecrets(portable) as PlainObject;
}

function mergeById(current: unknown[], incoming: unknown[]): unknown[] {
  return incoming.map((item) => {
    const match = isPlainObject(item) ? current.find((c) => isPlainObject(c) && c.id === item.id) : undefined;
    return match ? mergeSettings(match as PlainObject, item as PlainObject) : item;
  });
}

/**
 * 导入用：用备份覆盖当前设置，但备份里缺失的字段（被剔除的凭据）沿用本机现有值；
 * 渠道数组按 id 对齐，确保本机已配置的 API Key 不被清空。
 */
export function mergeSettings(current: PlainObject, incoming: PlainObject): PlainObject {
  const merged: PlainObject = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (NON_PORTABLE_SETTINGS.has(key)) continue;
    const existing = current[key];
    if (isPlainObject(existing) && isPlainObject(value)) merged[key] = mergeSettings(existing, value);
    else if (Array.isArray(existing) && Array.isArray(value)) merged[key] = mergeById(existing, value);
    else merged[key] = value;
  }
  return merged;
}
