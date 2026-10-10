import { describe, it, expect } from 'vitest';
import { buildClientConfigSnippet, buildInstallCommand } from '../mcpSnippets';

describe('buildInstallCommand', () => {
  it('默认端口不追加 --port', () => {
    expect(buildInstallCommand('auto', 18088)).toBe('bun run mcp:install');
    expect(buildInstallCommand('cursor', 18088)).toBe('bun run mcp:install cursor');
  });

  it('自定义端口必须追加 --port，否则安装脚本写入的是默认端口', () => {
    expect(buildInstallCommand('auto', 19000)).toBe('bun run mcp:install --port 19000');
    expect(buildInstallCommand('zed', 19000)).toBe('bun run mcp:install zed --port 19000');
  });
});

describe('buildClientConfigSnippet', () => {
  const bridge = '/path/to/picpocket/packages/mcp-bridge/src/index.ts';

  it('自定义端口通过 --port 传给 bridge（bridge 只认 --port 与 PICPOCKET_MCP_PORT）', () => {
    const json = JSON.parse(buildClientConfigSnippet('cursor', 19000, false));
    expect(json.mcpServers.picpocket.command).toBe('bun');
    expect(json.mcpServers.picpocket.args).toEqual(['run', bridge, '--port', '19000']);
    expect(JSON.stringify(json)).not.toContain('PICPOCKET_PORT');
  });

  it('默认端口不带端口参数', () => {
    const json = JSON.parse(buildClientConfigSnippet('windsurf', 18088, false));
    expect(json.mcpServers.picpocket.args).toEqual(['run', bridge]);
  });

  it('Zed 使用 context_servers 结构', () => {
    const json = JSON.parse(buildClientConfigSnippet('zed', 19000, false));
    expect(json.context_servers.picpocket.command).toEqual({
      path: 'bun',
      args: ['run', bridge, '--port', '19000'],
    });
  });

  it('Claude Code 给出 claude mcp add 命令并携带端口', () => {
    expect(buildClientConfigSnippet('claude', 18088, false)).toBe(`claude mcp add picpocket -- bun run ${bridge}`);
    expect(buildClientConfigSnippet('claude', 19000, false)).toBe(
      `claude mcp add picpocket -- bun run ${bridge} --port 19000`
    );
  });

  it('auto 给出一键注入脚本命令', () => {
    expect(buildClientConfigSnippet('auto', 19000, false)).toBe(
      '# Run automated MCP injection script:\nbun run mcp:install --port 19000'
    );
  });

  it('Windows 使用盘符示例路径', () => {
    const json = JSON.parse(buildClientConfigSnippet('cursor', 18088, true));
    expect(json.mcpServers.picpocket.args[1]).toBe('C:\\path\\to/picpocket/packages/mcp-bridge/src/index.ts');
  });
});
