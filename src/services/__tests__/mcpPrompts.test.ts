import { describe, it, expect } from 'vitest';
import {
  buildTargetedPrompt,
  buildAgentSetupPrompt,
  MCP_CLIENT_TARGETS,
  type McpClientTarget,
} from '../mcpPrompts';
import { DEFAULT_MCP_SETTINGS } from '@/utils/storage';

describe('mcpPrompts', () => {
  it('should define supported client targets', () => {
    expect(MCP_CLIENT_TARGETS.length).toBeGreaterThanOrEqual(6);
    const ids = MCP_CLIENT_TARGETS.map((c) => c.id);
    expect(ids).toContain('auto');
    expect(ids).toContain('cursor');
    expect(ids).toContain('claude');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('windsurf');
    expect(ids).toContain('zed');
  });

  it('all targeted prompts must include strict anti-drift guardrails', () => {
    const targets: McpClientTarget[] = ['auto', 'cursor', 'claude', 'antigravity', 'windsurf', 'zed'];

    for (const target of targets) {
      const prompt = buildTargetedPrompt(target, DEFAULT_MCP_SETTINGS);
      expect(prompt).toContain('CRITICAL ANTI-DRIFT INSTRUCTIONS');
      expect(prompt).toContain('run any repository tests');
      expect(prompt).toContain('run build commands');
      expect(prompt).toContain('run package installations');
    }
  });

  it('cursor targeted prompt should specifically target .cursor/mcp.json', () => {
    const prompt = buildTargetedPrompt('cursor', DEFAULT_MCP_SETTINGS);
    expect(prompt).toContain('.cursor/mcp.json');
    expect(prompt).toContain('mcpServers.picpocket');
    expect(prompt).not.toContain('context_servers');
  });

  it('claude targeted prompt should provide native claude mcp add command', () => {
    const prompt = buildTargetedPrompt('claude', DEFAULT_MCP_SETTINGS);
    expect(prompt).toContain('claude mcp add --scope project picpocket');
    expect(prompt).toContain('claude mcp list');
  });

  it('antigravity targeted prompt should target ~/.gemini/config/mcp_config.json', () => {
    const prompt = buildTargetedPrompt('antigravity', DEFAULT_MCP_SETTINGS);
    expect(prompt).toContain('~/.gemini/config/mcp_config.json');
    expect(prompt).toContain('mcpServers');
  });

  it('zed targeted prompt should use context_servers instead of mcpServers', () => {
    const prompt = buildTargetedPrompt('zed', DEFAULT_MCP_SETTINGS);
    expect(prompt).toContain('context_servers');
    expect(prompt).toContain('settings.json');
  });

  it('custom port should be reflected in targeted prompt', () => {
    const customConfig = {
      ...DEFAULT_MCP_SETTINGS,
      port: 19001,
    };
    const prompt = buildTargetedPrompt('cursor', customConfig);
    expect(prompt).toContain('19001');

    const claudePrompt = buildTargetedPrompt('claude', customConfig);
    expect(claudePrompt).toContain('--port 19001');
  });

  it('buildAgentSetupPrompt should fallback to auto prompt', () => {
    const prompt = buildAgentSetupPrompt(DEFAULT_MCP_SETTINGS);
    expect(prompt).toContain('Target Decision Matrix');
  });

  describe('专属 Token 透传', () => {
    const TOKEN = 'pp_AbC-123_xyz';
    const custom = { ...DEFAULT_MCP_SETTINGS, authToken: TOKEN };

    it('专属 Token 时 claude / windsurf / zed / auto 提示词都要求把 Token 交给 bridge', () => {
      expect(buildTargetedPrompt('claude', custom)).toContain(`-e PICPOCKET_MCP_TOKEN=${TOKEN} --`);
      expect(buildTargetedPrompt('windsurf', custom)).toContain(`"PICPOCKET_MCP_TOKEN": "${TOKEN}"`);
      expect(buildTargetedPrompt('zed', custom)).toContain(`"PICPOCKET_MCP_TOKEN": "${TOKEN}"`);
      expect(buildTargetedPrompt('auto', custom)).toContain(`-e PICPOCKET_MCP_TOKEN=${TOKEN} --`);
    });

    it('旧版默认 Token 时 claude / windsurf / zed 提示词保持不变（不带 env）', () => {
      for (const target of ['claude', 'windsurf', 'zed'] as const) {
        expect(buildTargetedPrompt(target, DEFAULT_MCP_SETTINGS)).not.toContain('PICPOCKET_MCP_TOKEN');
      }
    });
  });
});

describe('Token 插值转义', () => {
  const weird = 'pp_a"b\'c $(x)';
  const config = { ...DEFAULT_MCP_SETTINGS, authToken: weird };

  it('JSON 片段里的 Token 经过 JSON 转义', () => {
    const prompt = buildTargetedPrompt('cursor', config);
    expect(prompt).toContain(`"PICPOCKET_MCP_TOKEN": ${JSON.stringify(weird)}`);
    expect(prompt).not.toContain(`"PICPOCKET_MCP_TOKEN": "${weird}"`);
  });

  it('Claude Code 命令里的 Token 经过 shell 单引号转义', () => {
    const prompt = buildTargetedPrompt('claude', config);
    expect(prompt).toContain(`-e PICPOCKET_MCP_TOKEN='pp_a"b'\\''c $(x)'`);
  });
});
