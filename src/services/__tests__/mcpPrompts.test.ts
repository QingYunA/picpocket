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
});
