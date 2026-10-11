import type { McpClientTarget } from '@/services/mcpPrompts';

const DEFAULT_MCP_PORT = 18088;

/** bridge 只识别 `--port` 与环境变量 PICPOCKET_MCP_PORT；默认端口无需额外参数 */
const portArgs = (port: number): string[] => (port === DEFAULT_MCP_PORT ? [] : ['--port', String(port)]);

/** 一键注入脚本命令；自定义端口必须带上 --port，否则脚本写入的仍是默认端口 */
export function buildInstallCommand(target: McpClientTarget, port: number): string {
  return ['bun run mcp:install', ...(target === 'auto' ? [] : [target]), ...portArgs(port)].join(' ');
}

/** 各客户端的手动配置片段；路径只是示例，需要用户替换为本机仓库位置 */
export function buildClientConfigSnippet(target: McpClientTarget, port: number, isWindows: boolean): string {
  const bridgePath = `${isWindows ? 'C:\\path\\to' : '/path/to'}/picpocket/packages/mcp-bridge/src/index.ts`;
  const args = ['run', bridgePath, ...portArgs(port)];

  if (target === 'auto') {
    return `# Run automated MCP injection script:\n${buildInstallCommand('auto', port)}`;
  }
  if (target === 'claude') {
    return `claude mcp add picpocket -- bun ${args.join(' ')}`;
  }
  if (target === 'zed') {
    return JSON.stringify({ context_servers: { picpocket: { command: { path: 'bun', args } } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { picpocket: { command: 'bun', args } } }, null, 2);
}
