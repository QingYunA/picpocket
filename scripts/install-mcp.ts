import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execSync } from 'node:child_process';

interface TargetClient {
  id: string;
  name: string;
  configPath: string;
  schemaType: 'mcpServers' | 'context_servers';
  reloadGuide: string;
  isCustomHandler?: (binaryPath: string, bridgeScriptPath: string, port: number) => boolean;
}

function resolveBinaryPath(): string {
  try {
    const whichBun = execSync('which bun', { encoding: 'utf-8' }).trim();
    if (whichBun && fs.existsSync(whichBun)) return whichBun;
  } catch {}

  try {
    const whichNode = execSync('which node', { encoding: 'utf-8' }).trim();
    if (whichNode && fs.existsSync(whichNode)) return whichNode;
  } catch {}

  return process.execPath;
}

function parseCliArgs(): { target?: string; port: number } {
  const args = process.argv.slice(2);
  let target: string | undefined;
  let port = 18088;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const parsedPort = parseInt(args[i + 1], 10);
      if (!isNaN(parsedPort) && parsedPort > 0) {
        port = parsedPort;
        i++;
      }
    } else if (!arg.startsWith('-') && !target) {
      target = arg.toLowerCase().trim();
    }
  }

  const envPort = parseInt(
    process.env.PICPOCKET_MCP_PORT || process.env.PROMPTSNAP_MCP_PORT || '',
    10
  );
  if (!isNaN(envPort) && envPort > 0) {
    port = envPort;
  }

  return { target, port };
}

function getCandidateClients(home: string, appData: string, workspaceRoot: string, isWindows: boolean): TargetClient[] {
  return [
    {
      id: 'cursor',
      name: 'Cursor',
      configPath: path.join(workspaceRoot, '.cursor', 'mcp.json'),
      schemaType: 'mcpServers',
      reloadGuide: '打开 Cursor Settings > Features > MCP 点击刷新',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      configPath: path.join(workspaceRoot, '.mcp.json'),
      schemaType: 'mcpServers',
      reloadGuide: '进入 claude 会话输入 /mcp 即可使用',
      isCustomHandler: (binaryPath, bridgeScriptPath, port) => {
        try {
          execSync('claude --version', { stdio: ['pipe', 'pipe', 'pipe'] });
          execSync(
            `claude mcp add --scope project picpocket -- "${binaryPath}" "${bridgeScriptPath}" --port ${port}`,
            { stdio: ['pipe', 'pipe', 'pipe'] }
          );
          console.log(`\x1b[32m✔ [Claude Code 原生 CLI]\x1b[0m 已通过 claude mcp add 注册项目级服务`);
          return true;
        } catch {
          return false;
        }
      },
    },
    {
      id: 'antigravity',
      name: 'Antigravity / Gemini CLI',
      configPath: path.join(home, '.gemini', 'config', 'mcp_config.json'),
      schemaType: 'mcpServers',
      reloadGuide: '重启 Antigravity / Gemini 会话即可生效',
    },
    {
      id: 'windsurf',
      name: 'Windsurf (Cascade)',
      configPath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      schemaType: 'mcpServers',
      reloadGuide: '在 Cascade 面板点击 MCP 刷新图标',
    },
    {
      id: 'cline',
      name: 'Cline (VS Code)',
      configPath: isWindows
        ? path.join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
        : path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      schemaType: 'mcpServers',
      reloadGuide: '在 VS Code 运行 Developer: Reload Window',
    },
    {
      id: 'roo',
      name: 'Roo Code (VS Code)',
      configPath: isWindows
        ? path.join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json')
        : path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'),
      schemaType: 'mcpServers',
      reloadGuide: '在 Roo Code 设置中点击刷新',
    },
    {
      id: 'zed',
      name: 'Zed',
      configPath: isWindows
        ? path.join(appData, 'Zed', 'settings.json')
        : path.join(home, '.config', 'zed', 'settings.json'),
      schemaType: 'context_servers',
      reloadGuide: '保存 settings.json 自动重载生效',
    },
  ];
}

function injectClientConfig(
  client: TargetClient,
  binaryPath: string,
  bridgeScriptPath: string,
  port: number
): boolean {
  console.log(`\n\x1b[36m▶ 正在为 [${client.name}] 注入 PicPocket MCP 配置...\x1b[0m`);

  // Try custom handler (e.g. claude mcp add)
  if (client.isCustomHandler && client.isCustomHandler(binaryPath, bridgeScriptPath, port)) {
    return true;
  }

  const parentDir = path.dirname(client.configPath);
  const fileExists = fs.existsSync(client.configPath);

  let configObj: Record<string, any> = {};

  if (fileExists) {
    const rawContent = fs.readFileSync(client.configPath, 'utf-8');
    try {
      configObj = JSON.parse(rawContent);
    } catch {
      try {
        const stripped = rawContent
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*/g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        configObj = JSON.parse(stripped);
      } catch {
        console.warn(`\x1b[33m⚠ [${client.name}] 配置文件存在但非标准 JSON，已跳过以防止损坏: ${client.configPath}\x1b[0m`);
        return false;
      }
    }

    // Create backup
    const backupPath = `${client.configPath}.bak`;
    fs.writeFileSync(backupPath, rawContent, 'utf-8');
    console.log(`  \x1b[90m已安全备份原配置至: ${backupPath}\x1b[0m`);
  } else {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const serverArgs = port === 18088 ? [bridgeScriptPath] : [bridgeScriptPath, '--port', String(port)];

  if (client.schemaType === 'context_servers') {
    configObj.context_servers = configObj.context_servers || {};
    configObj.context_servers.picpocket = {
      command: binaryPath,
      args: serverArgs,
    };
  } else {
    configObj.mcpServers = configObj.mcpServers || {};
    configObj.mcpServers.picpocket = {
      command: binaryPath,
      args: serverArgs,
      env: {
        PICPOCKET_MCP_PORT: String(port),
      },
    };
  }

  fs.writeFileSync(client.configPath, JSON.stringify(configObj, null, 2), 'utf-8');
  console.log(`\x1b[32m✔ [${client.name}] 配置注入成功！\x1b[0m`);
  console.log(`  \x1b[90m文件路径: ${client.configPath}\x1b[0m`);
  console.log(`  \x1b[90m服务端口: ${port}\x1b[0m`);
  console.log(`  \x1b[90m生效指引: ${client.reloadGuide}\x1b[0m\n`);
  return true;
}

export async function installMcpConfig() {
  const isWindows = process.platform === 'win32';
  const home = os.homedir();
  const appData = process.env.APPDATA || (isWindows ? path.join(home, 'AppData', 'Roaming') : '');
  const workspaceRoot = process.cwd();
  const bridgeScriptPath = path.resolve(workspaceRoot, 'packages/mcp-bridge/src/index.ts');
  const binaryPath = resolveBinaryPath();

  console.log('\n\x1b[1m\x1b[36m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m       PicPocket 本地 MCP 定向配置程序 (Targeted)        \x1b[0m');
  console.log('\x1b[1m\x1b[36m========================================================\x1b[0m');

  if (!fs.existsSync(bridgeScriptPath)) {
    console.error(`\x1b[31m✖ 错误: 未在当前工作区找到 Bridge 脚本: ${bridgeScriptPath}\x1b[0m`);
    process.exit(1);
  }

  const { target, port } = parseCliArgs();
  const candidates = getCandidateClients(home, appData, workspaceRoot, isWindows);

  // 1. If target was explicitly passed via CLI
  if (target) {
    const aliasMap: Record<string, string> = {
      cursor: 'cursor',
      claude: 'claude',
      claudecode: 'claude',
      antigravity: 'antigravity',
      gemini: 'antigravity',
      windsurf: 'windsurf',
      zed: 'zed',
      cline: 'cline',
      roo: 'roo',
    };

    const normalizedId = aliasMap[target] || target;
    const matchedClient = candidates.find((c) => c.id === normalizedId);

    if (!matchedClient) {
      console.error(`\x1b[31m✖ 未知的目标客户端: "${target}"\x1b[0m`);
      console.log(`可选的目标包括: cursor, claude, antigravity, windsurf, zed, cline, roo`);
      process.exit(1);
    }

    injectClientConfig(matchedClient, binaryPath, bridgeScriptPath, port);
    return;
  }

  // 2. No target specified - check if interactive TTY
  if (process.stdin.isTTY) {
    console.log(`\n\x1b[33m请选择你要为其配置 PicPocket MCP 的目标 Agent/编辑器 (单选)：\x1b[0m\n`);
    candidates.forEach((c, idx) => {
      console.log(`  \x1b[1m[${idx + 1}]\x1b[0m ${c.name} \x1b[90m(${c.configPath})\x1b[0m`);
    });
    console.log(`  \x1b[1m[0]\x1b[0m 取消并退出\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('请输入序号 [0-7]: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });

    const choice = parseInt(answer, 10);
    if (isNaN(choice) || choice === 0) {
      console.log('\n\x1b[90m已取消配置操作。\x1b[0m\n');
      return;
    }

    const selectedClient = candidates[choice - 1];
    if (!selectedClient) {
      console.error('\n\x1b[31m✖ 无效的选项。\x1b[0m\n');
      return;
    }

    injectClientConfig(selectedClient, binaryPath, bridgeScriptPath, port);
    return;
  }

  // 3. Non-interactive mode without target argument: reject blind full injection
  console.log(`\n\x1b[33mℹ 提示: 当前为非交互模式且未指定目标 Agent。\x1b[0m`);
  console.log(`为避免未经授权篡改其他编辑器的配置，请在命令行中指定目标，例如:`);
  console.log(`  \x1b[32mbun run mcp:install cursor\x1b[0m       # 为 Cursor 配置`);
  console.log(`  \x1b[32mbun run mcp:install claude\x1b[0m       # 为 Claude Code 配置`);
  console.log(`  \x1b[32mbun run mcp:install antigravity\x1b[0m  # 为 Antigravity 配置`);
  console.log(`  \x1b[32mbun run mcp:install windsurf\x1b[0m     # 为 Windsurf 配置`);
  console.log(`  \x1b[32mbun run mcp:install zed\x1b[0m          # 为 Zed 配置`);
  console.log(`  可选附加参数: --port <port> (默认 18088)\n`);
}

if (import.meta.main) {
  installMcpConfig();
}
