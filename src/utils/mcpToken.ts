/** 旧版公开的固定配对 Token；仅为兼容存量配置保留，新安装不再使用 */
export const LEGACY_MCP_AUTH_TOKEN = 'promptsnap-local-token';

const TOKEN_PREFIX = 'pp_';
const TOKEN_BYTES = 32;

type RandomFill = (bytes: Uint8Array) => Uint8Array;

/** 生成每次安装独有的 MCP 配对 Token：`pp_` + 32 字节密码学随机数的 base64url */
export function generateMcpAuthToken(fill: RandomFill = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = fill(new Uint8Array(TOKEN_BYTES));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${TOKEN_PREFIX}${base64url}`;
}

/** 空值或旧版公开默认值都视为「未配置专属 Token」 */
export function isLegacyMcpToken(token: string | undefined): boolean {
  return !token || token === LEGACY_MCP_AUTH_TOKEN;
}
