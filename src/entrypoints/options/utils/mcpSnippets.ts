import type { McpClientTarget } from '@/services/mcpPrompts';
import { isLegacyMcpToken } from '@/utils/mcpToken';

const DEFAULT_MCP_PORT = 18088;

/** bridge 只识别 `--port` 与环境变量 PICPOCKET_MCP_PORT；默认端口无需额外参数 */
const portArgs = (port: number): string[] => (port === DEFAULT_MCP_PORT ? [] : ['--port', String(port)]);

/** bridge 通过环境变量 PICPOCKET_MCP_TOKEN 读取配对 Token */
const TOKEN_ENV_KEY = 'PICPOCKET_MCP_TOKEN';

/** POSIX shell 单引号转义；随机 Token 只含安全字符，原样输出 */
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_.@%+=:,/-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 仅当 Token 不是旧版公开默认值时才需要显式传给 bridge（默认值 bridge 自带回退，保持旧版片段不变） */
const explicitToken = (token?: string): string | undefined => (isLegacyMcpToken(token) ? undefined : token);

/** 一键注入脚本命令；自定义端口必须带上 --port，否则脚本写入的仍是默认端口 */
export function buildInstallCommand(target: McpClientTarget, port: number, token?: string): string {
  const t = explicitToken(token);
  return [
    'bun run mcp:install',
    ...(target === 'auto' ? [] : [target]),
    ...portArgs(port),
    ...(t ? ['--token', shellQuote(t)] : []),
  ].join(' ');
}

/** 手动启动 bridge 的终端命令；专属 Token 用环境变量前缀传递（POSIX shell） */
export function buildBridgeCommand(port: number, token?: string): string {
  const t = explicitToken(token);
  return [...(t ? [`${TOKEN_ENV_KEY}=${shellQuote(t)}`] : []), 'bun run mcp', ...portArgs(port)].join(' ');
}

/** 各客户端的手动配置片段；路径只是示例，需要用户替换为本机仓库位置 */
export function buildClientConfigSnippet(
  target: McpClientTarget,
  port: number,
  isWindows: boolean,
  token?: string
): string {
  const bridgePath = `${isWindows ? 'C:\\path\\to' : '/path/to'}/picpocket/packages/mcp-bridge/src/index.ts`;
  const args = ['run', bridgePath, ...portArgs(port)];
  const t = explicitToken(token);
  const env = t ? { [TOKEN_ENV_KEY]: t } : undefined;

  if (target === 'auto') {
    return `# Run automated MCP injection script:\n${buildInstallCommand('auto', port, token)}`;
  }
  if (target === 'claude') {
    // -e 必须放在服务名之后：写在前面时 claude 会把服务名当成环境变量吞掉
    const envFlag = t ? ` -e ${TOKEN_ENV_KEY}=${shellQuote(t)}` : '';
    return `claude mcp add picpocket${envFlag} -- bun ${args.join(' ')}`;
  }
  if (target === 'zed') {
    return JSON.stringify({ context_servers: { picpocket: { command: { path: 'bun', args, ...(env && { env }) } } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { picpocket: { command: 'bun', args, ...(env && { env }) } } }, null, 2);
}
