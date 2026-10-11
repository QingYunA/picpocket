import { DEFAULT_MCP_SETTINGS, getUserSettings, saveUserSettings } from '@/utils/storage';
import { generateMcpAuthToken, isLegacyMcpToken } from '@/utils/mcpToken';

/**
 * 全新安装时为本机生成专属 MCP 配对 Token，替换公开的旧版默认值。
 * 已有专属 Token 的不会被覆盖；更新安装（存量用户）不应调用，以免已配置的 MCP 客户端失效。
 * 持久化走 saveUserSettings（串行写入 + 三层存储降级）。
 */
export async function ensureMcpAuthTokenOnInstall(): Promise<void> {
  const settings = await getUserSettings();
  const mcp = settings.mcpSettings || DEFAULT_MCP_SETTINGS;
  if (!isLegacyMcpToken(mcp.authToken)) return;
  await saveUserSettings({ mcpSettings: { ...mcp, authToken: generateMcpAuthToken() } });
}
