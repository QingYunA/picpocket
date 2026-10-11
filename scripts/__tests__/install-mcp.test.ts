import { describe, it, expect } from 'vitest';
import { parseCliArgs, buildServerEntry, buildClaudeAddArgs } from '../install-mcp';

const TOKEN = 'pp_AbC-123_xyz';
const LEGACY = 'promptsnap-local-token';

describe('parseCliArgs', () => {
  it('无参数时使用默认端口，无目标、无 Token', () => {
    expect(parseCliArgs([], {})).toEqual({ target: undefined, port: 18088, token: undefined });
  });

  it('解析目标、--port 与 --token', () => {
    expect(parseCliArgs(['Cursor', '--port', '19000', '--token', TOKEN], {})).toEqual({
      target: 'cursor',
      port: 19000,
      token: TOKEN,
    });
  });

  it('支持 --token=<value> 写法，参数顺序无关', () => {
    expect(parseCliArgs([`--token=${TOKEN}`, 'zed'], {})).toMatchObject({ target: 'zed', token: TOKEN });
  });

  it('--token 缺少取值或取值为空时忽略，且不会把后续选项当作 Token', () => {
    expect(parseCliArgs(['cursor', '--token'], {}).token).toBeUndefined();
    expect(parseCliArgs(['--token', '--port', '19000'], {})).toMatchObject({ token: undefined, port: 19000 });
    expect(parseCliArgs(['--token='], {}).token).toBeUndefined();
  });

  it('--token 取值不会被误当作目标客户端', () => {
    expect(parseCliArgs(['--token', TOKEN], {}).target).toBeUndefined();
  });

  it('环境变量端口优先于命令行（保持原有行为）', () => {
    expect(parseCliArgs(['--port', '19000'], { PICPOCKET_MCP_PORT: '20000' }).port).toBe(20000);
  });
});

describe('buildServerEntry', () => {
  it('mcpServers：默认端口、无 Token 时与旧版一致', () => {
    expect(buildServerEntry('mcpServers', '/bin/bun', '/p/index.ts', 18088)).toEqual({
      command: '/bin/bun',
      args: ['/p/index.ts'],
      env: { PICPOCKET_MCP_PORT: '18088' },
    });
  });

  it('mcpServers：专属 Token 写入 env.PICPOCKET_MCP_TOKEN', () => {
    expect(buildServerEntry('mcpServers', '/bin/bun', '/p/index.ts', 19000, TOKEN)).toEqual({
      command: '/bin/bun',
      args: ['/p/index.ts', '--port', '19000'],
      env: { PICPOCKET_MCP_PORT: '19000', PICPOCKET_MCP_TOKEN: TOKEN },
    });
  });

  it('context_servers（Zed）：专属 Token 写入同级 env，无 Token 时不带 env', () => {
    expect(buildServerEntry('context_servers', '/bin/bun', '/p/index.ts', 18088)).toEqual({
      command: '/bin/bun',
      args: ['/p/index.ts'],
    });
    expect(buildServerEntry('context_servers', '/bin/bun', '/p/index.ts', 18088, TOKEN)).toEqual({
      command: '/bin/bun',
      args: ['/p/index.ts'],
      env: { PICPOCKET_MCP_TOKEN: TOKEN },
    });
  });

  it('旧版默认 Token 视同未配置，不写 env.PICPOCKET_MCP_TOKEN', () => {
    const entry = buildServerEntry('mcpServers', '/bin/bun', '/p/index.ts', 18088, LEGACY) as { env: object };
    expect(entry.env).not.toHaveProperty('PICPOCKET_MCP_TOKEN');
  });
});

describe('buildClaudeAddArgs', () => {
  it('-e 放在服务名之后，并以 -- 分隔 bridge 命令（不经 shell，Token 无需转义）', () => {
    expect(buildClaudeAddArgs('/bin/bun', '/p/index.ts', 19000, TOKEN)).toEqual([
      'mcp', 'add', '--scope', 'project', 'picpocket',
      '-e', `PICPOCKET_MCP_TOKEN=${TOKEN}`,
      '--', '/bin/bun', '/p/index.ts', '--port', '19000',
    ]);
  });

  it('无专属 Token 时不带 -e', () => {
    expect(buildClaudeAddArgs('/bin/bun', '/p/index.ts', 18088)).not.toContain('-e');
  });
});
