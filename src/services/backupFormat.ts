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

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * 备份不含凭据，恢复后本机已有的 Key 会被发往备份里指定的端点——恶意备份可借此窃取 Key。
 * 因此：恢复时备份里的端点，绝不能替换「会收到本机已有凭据」的本机端点。
 * - hostedProxyUrl（PicPocket 自有服务端点）：永不从备份恢复
 * - baseUrl / imageBaseUrl：本机有对应 Key 且备份值不同则保留本机值（生图未单独配 Key 时继承 apiKey）
 * - 渠道按 id 对齐：本机已存在且有 Key（生图渠道自身无 Key 时继承 apiKey）则保留本机 baseUrl；
 *   本机不存在或无 Key 的渠道原样恢复（用户之后需主动填 Key）
 * 纯函数，不修改入参；keptCount 为被保留的本机端点个数。
 */
export function protectLocalEndpoints(
  local: PlainObject,
  restored: PlainObject
): { settings: PlainObject; keptCount: number } {
  const settings: PlainObject = { ...restored };
  let keptCount = 0;

  if (settings.hostedProxyUrl !== local.hostedProxyUrl) {
    if (local.hostedProxyUrl === undefined) delete settings.hostedProxyUrl;
    else settings.hostedProxyUrl = local.hostedProxyUrl;
    keptCount++;
  }

  const protectUrl = (urlField: string, keyed: boolean) => {
    if (keyed && settings[urlField] !== local[urlField]) {
      if (local[urlField] === undefined) delete settings[urlField];
      else settings[urlField] = local[urlField];
      keptCount++;
    }
  };
  protectUrl('baseUrl', hasText(local.apiKey));
  protectUrl('imageBaseUrl', hasText(local.imageApiKey) || hasText(local.apiKey));

  const protectChannels = (field: 'visionChannels' | 'imageChannels', inheritsMainKey: boolean) => {
    const channels = settings[field];
    const localChannels = local[field];
    if (!Array.isArray(channels) || !Array.isArray(localChannels)) return;
    settings[field] = channels.map((channel) => {
      if (!isPlainObject(channel)) return channel;
      const existing = localChannels.find((c) => isPlainObject(c) && c.id === channel.id);
      if (!isPlainObject(existing)) return channel;
      const keyed = hasText(existing.apiKey) || (inheritsMainKey && hasText(local.apiKey));
      if (!keyed || channel.baseUrl === existing.baseUrl) return channel;
      keptCount++;
      return { ...channel, baseUrl: existing.baseUrl };
    });
  };
  protectChannels('visionChannels', false);
  protectChannels('imageChannels', true);

  return { settings, keptCount };
}

/** 导入用：先合并备份设置，再确保备份端点不会接走本机已有的凭据 */
export function mergeRestoredSettings(current: PlainObject, incoming: PlainObject): PlainObject {
  return protectLocalEndpoints(current, mergeSettings(current, incoming)).settings;
}
