/** 旧版公开的固定配对 Token；仅为兼容存量配置保留 */
export const LEGACY_AUTH_TOKEN = 'promptsnap-local-token';

export const DEFAULT_TOKEN_WARNING =
  '[PicPocket MCP Bridge] WARNING: using the public default pairing token; any local page could impersonate the extension. Copy the MCP config from PicPocket settings (MCP page) again, or set PICPOCKET_MCP_TOKEN to the token in that config.';

/** 解析配对 Token：PICPOCKET_MCP_TOKEN 优先，其次兼容 PROMPTSNAP_MCP_TOKEN，都没有则回退旧版默认值 */
export function resolveAuthToken(env: Record<string, string | undefined>): { token: string; isLegacyDefault: boolean } {
  const token = env.PICPOCKET_MCP_TOKEN || env.PROMPTSNAP_MCP_TOKEN || LEGACY_AUTH_TOKEN;
  return { token, isLegacyDefault: token === LEGACY_AUTH_TOKEN };
}
