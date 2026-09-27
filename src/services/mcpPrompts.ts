import type { McpSettings } from '@/types';

export type McpClientTarget = 'auto' | 'cursor' | 'claude' | 'antigravity' | 'windsurf' | 'zed';

export interface McpClientMeta {
  id: McpClientTarget;
  label: string;
  installArg?: string;
  configPathHint: string;
}

export const MCP_CLIENT_TARGETS: McpClientMeta[] = [
  { id: 'auto', label: '自适应 (Auto)', installArg: '', configPathHint: '自动探测运行环境与客户端' },
  { id: 'cursor', label: 'Cursor', installArg: 'cursor', configPathHint: '.cursor/mcp.json' },
  { id: 'claude', label: 'Claude Code', installArg: 'claude', configPathHint: 'claude mcp add / .claude.json' },
  { id: 'antigravity', label: 'Antigravity', installArg: 'antigravity', configPathHint: '~/.gemini/config/mcp_config.json' },
  { id: 'windsurf', label: 'Windsurf', installArg: 'windsurf', configPathHint: '~/.codeium/windsurf/mcp_config.json' },
  { id: 'zed', label: 'Zed', installArg: 'zed', configPathHint: '~/.config/zed/settings.json' },
];

const ANTI_DRIFT_NOTICE = `### 🛑 CRITICAL ANTI-DRIFT INSTRUCTIONS (STRICT GUARDRAILS):
1. **Single Goal**: You are ONLY configuring your own MCP client/environment for PicPocket.
2. **DO NOT** run any repository tests (\`bun test\`, \`vitest\`, etc.).
3. **DO NOT** run build commands (\`bun run build\`, \`tsc\`, \`wxt\`, etc.).
4. **DO NOT** run package installations (\`bun install\`, \`npm install\`, etc.).
5. **DO NOT** modify any application code or other editors' config files.
6. **FINISH IMMEDIATELY**: After safely merging the JSON entry and validating syntax, verify and report success to the user immediately.`;

/**
 * 针对具体 Agent 客户端生成专属极简接引 Prompt
 */
export function buildTargetedPrompt(target: McpClientTarget, mcpConfig: McpSettings): string {
  const port = mcpConfig.port || 18088;
  const token = mcpConfig.authToken || 'picpocket-local-token';

  if (target === 'cursor') {
    return `${ANTI_DRIFT_NOTICE}

You are an expert AI assistant running inside Cursor. Configure the PicPocket local MCP server for Cursor.

### Target Specifications:
- Target File: Workspace \`.cursor/mcp.json\` (create if missing, or user global \`~/.cursor/mcp.json\`)
- Config Root Key: \`"mcpServers.picpocket"\`
- Server Command: \`bun\` (resolve full absolute path via \`which bun || which node\`)
- Script Entry: absolute path to \`packages/mcp-bridge/src/index.ts\` in this project
- Optional Args/Env: pass \`"--port", "${port}"\` in args, or env \`{"PICPOCKET_MCP_PORT": "${port}", "PICPOCKET_MCP_TOKEN": "${token}"}\`

### Strict Non-Destructive Rules:
- If \`.cursor/mcp.json\` already exists, backup to \`.cursor/mcp.json.bak\` first.
- Only insert or update the \`"picpocket"\` key inside \`mcpServers\`. DO NOT touch other existing servers!
- Format JSON with 2-space indentation.
- Exit and inform the user to reload MCP via Cursor Settings > Features > MCP.`;
  }

  if (target === 'claude') {
    return `${ANTI_DRIFT_NOTICE}

You are an expert AI assistant running Claude Code CLI. Configure the PicPocket local MCP server for Claude Code.

### Fast Installation Method:
Run the official Claude Code CLI registration command:
\`\`\`bash
claude mcp add --scope project picpocket -- $(which bun || echo bun) $(pwd)/packages/mcp-bridge/src/index.ts --port ${port}
\`\`\`

### Verification:
Run \`claude mcp list\` to confirm "picpocket" is listed. Then report completion to user immediately.`;
  }

  if (target === 'antigravity') {
    return `${ANTI_DRIFT_NOTICE}

You are an expert AI assistant running inside Google Antigravity / Gemini CLI. Configure the PicPocket local MCP server.

### Target Specifications:
- Target File: \`~/.gemini/config/mcp_config.json\` (create if missing)
- Config Root Key: \`"mcpServers.picpocket"\`
- Content structure:
\`\`\`json
{
  "mcpServers": {
    "picpocket": {
      "command": "<absolute-path-to-bun>",
      "args": ["<absolute-path-to-project>/packages/mcp-bridge/src/index.ts", "--port", "${port}"],
      "env": {
        "PICPOCKET_MCP_PORT": "${port}",
        "PICPOCKET_MCP_TOKEN": "${token}"
      }
    }
  }
}
\`\`\`

### Strict Non-Destructive Rules:
- If \`~/.gemini/config/mcp_config.json\` exists, backup first.
- Only update \`mcpServers.picpocket\`, preserve all other servers.
- Verify JSON parses with zero errors and report completion immediately.`;
  }

  if (target === 'windsurf') {
    return `${ANTI_DRIFT_NOTICE}

You are an expert AI assistant running inside Windsurf. Configure the PicPocket local MCP server for Windsurf Cascade.

### Target Specifications:
- Target File: \`~/.codeium/windsurf/mcp_config.json\` (Windows: \`%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json\`)
- Config Root Key: \`"mcpServers.picpocket"\`
- Structure:
\`\`\`json
{
  "mcpServers": {
    "picpocket": {
      "command": "<absolute-path-to-bun>",
      "args": ["<absolute-path-to-project>/packages/mcp-bridge/src/index.ts", "--port", "${port}"]
    }
  }
}
\`\`\`

### Strict Non-Destructive Rules:
- Backup existing file to \`.bak\`.
- Safely merge \`"picpocket"\` under \`mcpServers\`. DO NOT delete other servers.
- Inform the user to click Refresh in Cascade MCP settings.`;
  }

  if (target === 'zed') {
    return `${ANTI_DRIFT_NOTICE}

You are an expert AI assistant running inside Zed editor. Configure the PicPocket local MCP server for Zed.

### Target Specifications:
- Target File: \`~/.config/zed/settings.json\` (Windows: \`%APPDATA%\\Zed\\settings.json\`)
- Note: Zed uses \`"context_servers"\` key (NOT \`"mcpServers"\`!).
- Structure:
\`\`\`json
{
  "context_servers": {
    "picpocket": {
      "command": "<absolute-path-to-bun>",
      "args": ["<absolute-path-to-project>/packages/mcp-bridge/src/index.ts", "--port", "${port}"]
    }
  }
}
\`\`\`

### Strict Non-Destructive Rules:
- Backup \`settings.json\` to \`settings.json.bak\`.
- Safely merge under \`context_servers.picpocket\`.
- Inform the user that saving will automatically hot-reload Zed context servers.`;
  }

  // Fallback: Auto-detecting multi-agent prompt with anti-drift protection
  return `${ANTI_DRIFT_NOTICE}

You are an expert AI development assistant. Safely configure the PicPocket local MCP server for YOUR CURRENT editor/environment.

### Target Server Specifications:
- Server Name: "picpocket"
- Executable Command: "bun" (Fallback: "node")
- Script Entry: "packages/mcp-bridge/src/index.ts" (relative to project root)
- Port: "${port}"
- Token: "${token}"

### Target Decision Matrix (Pick YOUR host only):
1. **If you are Cursor**: Target workspace \`.cursor/mcp.json\` -> key \`mcpServers.picpocket\`.
2. **If you are Claude Code**: Run \`claude mcp add --scope project picpocket -- $(which bun) $(pwd)/packages/mcp-bridge/src/index.ts --port ${port}\`.
3. **If you are Antigravity**: Target \`~/.gemini/config/mcp_config.json\` -> key \`mcpServers.picpocket\`.
4. **If you are Windsurf**: Target \`~/.codeium/windsurf/mcp_config.json\` -> key \`mcpServers.picpocket\`.
5. **If you are Zed**: Target \`~/.config/zed/settings.json\` -> key \`context_servers.picpocket\`.

### Non-Destructive Merge:
- NEVER overwrite entire files; backup first with \`.bak\`.
- Safely merge ONLY the \`"picpocket"\` key into your host configuration.
- Stop immediately after writing and validating.`;
}

/**
 * 兼容旧调用：默认生成自适应 Prompt
 */
export function buildAgentSetupPrompt(mcpConfig: McpSettings): string {
  return buildTargetedPrompt('auto', mcpConfig);
}
