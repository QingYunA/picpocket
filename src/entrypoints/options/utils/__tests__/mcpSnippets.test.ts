import { describe, it, expect } from 'vitest';
import { buildBridgeCommand, buildClientConfigSnippet, buildInstallCommand } from '../mcpSnippets';
import { LEGACY_MCP_AUTH_TOKEN } from '@/utils/mcpToken';

const TOKEN = 'pp_AbC-123_xyz';

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
    // 与 mcp:install 写入 Zed 的扁平形态一致：command / args / env 同级
    expect(json.context_servers.picpocket).toEqual({
      command: 'bun',
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

describe('专属 Token 透传给 bridge', () => {
  const bridge = '/path/to/picpocket/packages/mcp-bridge/src/index.ts';

  it('旧版默认 Token 或空值时片段与历史版本完全一致', () => {
    for (const token of [LEGACY_MCP_AUTH_TOKEN, '', undefined]) {
      expect(buildInstallCommand('cursor', 18088, token)).toBe('bun run mcp:install cursor');
      expect(buildClientConfigSnippet('claude', 18088, false, token)).toBe(`claude mcp add picpocket -- bun run ${bridge}`);
      const json = JSON.parse(buildClientConfigSnippet('cursor', 18088, false, token));
      expect(json.mcpServers.picpocket.env).toBeUndefined();
      const zed = JSON.parse(buildClientConfigSnippet('zed', 18088, false, token));
      expect(zed.context_servers.picpocket.env).toBeUndefined();
      expect(buildBridgeCommand(18088, token)).toBe('bun run mcp');
    }
  });

  it('JSON 客户端通过 env.PICPOCKET_MCP_TOKEN 传递', () => {
    for (const target of ['cursor', 'antigravity', 'windsurf'] as const) {
      const json = JSON.parse(buildClientConfigSnippet(target, 19000, false, TOKEN));
      expect(json.mcpServers.picpocket.env).toEqual({ PICPOCKET_MCP_TOKEN: TOKEN });
      expect(json.mcpServers.picpocket.args).toEqual(['run', bridge, '--port', '19000']);
    }
  });

  it('Zed 的 env 与 command / args 同级', () => {
    const json = JSON.parse(buildClientConfigSnippet('zed', 18088, false, TOKEN));
    expect(json.context_servers.picpocket).toEqual({
      command: 'bun',
      args: ['run', bridge],
      env: { PICPOCKET_MCP_TOKEN: TOKEN },
    });
  });

  it('Claude Code 用 -e 传递，且必须放在服务名之后（放在前面会吞掉服务名）', () => {
    expect(buildClientConfigSnippet('claude', 18088, false, TOKEN)).toBe(
      `claude mcp add picpocket -e PICPOCKET_MCP_TOKEN=${TOKEN} -- bun run ${bridge}`
    );
    expect(buildClientConfigSnippet('claude', 19000, false, TOKEN)).toBe(
      `claude mcp add picpocket -e PICPOCKET_MCP_TOKEN=${TOKEN} -- bun run ${bridge} --port 19000`
    );
  });

  it('一键安装命令追加 --token，含特殊字符的 Token 会被引号包裹', () => {
    expect(buildInstallCommand('auto', 18088, TOKEN)).toBe(`bun run mcp:install --token ${TOKEN}`);
    expect(buildInstallCommand('zed', 19000, TOKEN)).toBe(`bun run mcp:install zed --port 19000 --token ${TOKEN}`);
    expect(buildInstallCommand('cursor', 18088, "a b'c")).toBe(`bun run mcp:install cursor --token 'a b'\\''c'`);
  });

  it('auto 片段携带 --token 的注入命令', () => {
    expect(buildClientConfigSnippet('auto', 18088, false, TOKEN)).toBe(
      `# Run automated MCP injection script:\nbun run mcp:install --token ${TOKEN}`
    );
  });

  it('手动启动 bridge 的命令用环境变量前缀传递 Token', () => {
    expect(buildBridgeCommand(18088, TOKEN)).toBe(`PICPOCKET_MCP_TOKEN=${TOKEN} bun run mcp`);
    expect(buildBridgeCommand(19000, TOKEN)).toBe(`PICPOCKET_MCP_TOKEN=${TOKEN} bun run mcp --port 19000`);
    expect(buildBridgeCommand(19000)).toBe('bun run mcp --port 19000');
  });
});
