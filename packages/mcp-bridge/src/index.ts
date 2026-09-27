import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const val = args[i + 1];
    if ((args[i] === '--port' || args[i] === '-p') && val) {
      const p = parseInt(val, 10);
      if (!isNaN(p) && p > 0 && p < 65536) return p;
    }
  }
  const envPort = parseInt(
    process.env.PICPOCKET_MCP_PORT || process.env.PROMPTSNAP_MCP_PORT || '',
    10
  );
  if (!isNaN(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return 18088;
}

const PORT = resolvePort();
const AUTH_TOKEN =
  process.env.PICPOCKET_MCP_TOKEN ||
  process.env.PROMPTSNAP_MCP_TOKEN ||
  'promptsnap-local-token';

let activeExtensionSocket: WebSocket | null = null;
const pendingCalls = new Map<
  string,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  }
>();

// ----------------------------------------------------------------------
// 1. Local WebSocket Server for Chrome Extension
// ----------------------------------------------------------------------

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

wss.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[PicPocket MCP Bridge] Port 127.0.0.1:${PORT} is already in use.`
    );
    console.error(
      `[PicPocket MCP Bridge] If this port is occupied by another process, specify a custom port with '--port <port>' or in PicPocket sidepanel settings.`
    );
    console.error(
      `[PicPocket MCP Bridge] If another PicPocket bridge instance is already running, passive stdio proxying is active.`
    );
  } else {
    console.error('[PicPocket MCP Bridge] WebSocket server error:', err);
  }
});

process.on('uncaughtException', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[PicPocket MCP Bridge] Notice: Port ${PORT} already bound. Proceeding in passive bridge mode.`
    );
    return;
  }
  console.error('[PicPocket MCP Bridge] Uncaught exception:', err);
});

console.error(`[PicPocket MCP Bridge] WebSocket server listening on 127.0.0.1:${PORT}`);

const EXPECTED_EXTENSION_ID =
  process.env.PICPOCKET_EXTENSION_ID || process.env.PROMPTSNAP_EXTENSION_ID;

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  const isExtension = origin.startsWith('chrome-extension://');
  const isLocalDev = origin.includes('localhost') || origin.includes('127.0.0.1');

  // Security guard: Must have valid origin (Extension or local dev)
  if (!origin || (!isExtension && !isLocalDev)) {
    console.error(`[PicPocket MCP Bridge] Rejected connection from unauthorized origin: ${origin || '(empty)'}`);
    ws.close(4003, 'Unauthorized origin');
    return;
  }

  if (EXPECTED_EXTENSION_ID && isExtension && origin !== `chrome-extension://${EXPECTED_EXTENSION_ID}`) {
    console.error(`[PicPocket MCP Bridge] Rejected connection: Extension ID mismatch (${origin})`);
    ws.close(4003, 'Extension ID mismatch');
    return;
  }


  let isAuthenticated = false;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handshake
      if (msg.type === 'register') {
        if (msg.token === AUTH_TOKEN) {
          isAuthenticated = true;
          activeExtensionSocket = ws;
          console.error('[PicPocket MCP Bridge] Chrome extension authenticated and connected');
          ws.send(JSON.stringify({ type: 'registered', success: true }));
        } else {
          console.error('[PicPocket MCP Bridge] Authentication failed: invalid token');
          ws.send(JSON.stringify({ type: 'registered', success: false, error: 'Invalid token' }));
          ws.close(4001, 'Invalid auth token');
        }
        return;
      }

      if (!isAuthenticated) {
        ws.close(4001, 'Unauthenticated');
        return;
      }

      // Handle tool call results returned from extension
      if (msg.type === 'tool_result' && msg.id) {
        const pending = pendingCalls.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingCalls.delete(msg.id);
          pending.resolve(msg.result);
        }
      }
    } catch (err) {
      console.error('[PicPocket MCP Bridge] Error parsing message from extension:', err);
    }
  });

  ws.on('close', () => {
    if (activeExtensionSocket === ws) {
      activeExtensionSocket = null;
      console.error('[PicPocket MCP Bridge] Chrome extension disconnected');
    }
  });

  ws.on('error', (err) => {
    console.error('[PicPocket MCP Bridge] WebSocket connection error:', err);
  });
});

// ----------------------------------------------------------------------
// 2. Standard MCP stdio Server
// ----------------------------------------------------------------------

const mcpServer = new Server(
  {
    name: 'picpocket-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_prompts_and_assets',
        description:
          'Search prompts, tags, and inspiration items saved in the user\'s local PicPocket library.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword to search across prompts, titles, and tags' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            type: {
              type: 'string',
              enum: ['all', 'prompts', 'inspirations'],
              description: 'Type of items to search (default: "all")',
            },
            limit: { type: 'number', description: 'Max number of items to return (default 10)' },
          },
        },
      },
      {
        name: 'generate_and_save_asset',
        description:
          'Generate an image using the user\'s configured AI image generation provider (DALL-E, Flux, SiliconFlow, etc.) and save it automatically to PicPocket. Supports optional reference image for image-to-image (垫图生成).',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The text prompt to generate an image from' },
            aspectRatio: {
              type: 'string',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '2:3'],
              description: 'Aspect ratio of the generated image (e.g. 16:9 for widescreen, 1:1 for square)',
            },
            folderName: { type: 'string', description: 'Name of the target folder to organize into' },
            folderId: { type: 'number', description: 'ID of the target folder in PicPocket' },
            negativePrompt: { type: 'string', description: 'Optional negative prompt' },
            model: { type: 'string', description: 'Optional specific model override' },
            referenceAssetId: {
              type: 'number',
              description:
                'Optional ID of an existing item in the PicPocket library to use as a reference image for image-to-image generation.',
            },
            referenceImageUrl: {
              type: 'string',
              description:
                'Optional URL or base64 dataUrl of an image to use as a reference image for image-to-image generation.',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'save_asset',
        description:
          'Save an externally generated image (URL or dataUrl/base64) along with its prompt into PicPocket.',
        inputSchema: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string', description: 'URL or base64 dataUrl of the image' },
            prompt: { type: 'string', description: 'Generation prompt' },
            title: { type: 'string', description: 'Optional title' },
            aspectRatio: {
              type: 'string',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '2:3'],
              description: 'Aspect ratio of the image (default: "1:1")',
            },
            folderName: { type: 'string', description: 'Optional target folder name' },
            folderId: { type: 'number', description: 'Optional target folder ID' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags to associate' },
          },
          required: ['imageUrl', 'prompt'],
        },
      },
      {
        name: 'save_prompt',
        description:
          'Save a refined prompt draft or building blocks into the user\'s PicPocket prompt library.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The text prompt content to save' },
            title: { type: 'string', description: 'Optional short title for the prompt' },
            category: { type: 'string', description: 'Optional category name (default: "Agent沉淀")' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
            description: { type: 'string', description: 'Optional explanation or description' },
            folderName: { type: 'string', description: 'Optional folder name' },
            folderId: { type: 'number', description: 'Optional folder ID' },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'manage_folders',
        description: 'List folders or create a new folder in PicPocket.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create'], description: 'Action to perform' },
            name: { type: 'string', description: 'Folder name (required when action is "create")' },
            parentId: { type: 'number', description: 'Optional parent folder ID' },
          },
        },
      },
      {
        name: 'update_tags',
        description: 'Update or append tags for a saved item or prompt in PicPocket.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'number', description: 'ID of the gallery item to update tags for' },
            promptId: { type: 'string', description: 'ID of the prompt item to update tags for' },
            tags: { type: 'array', items: { type: 'string' }, description: 'List of tags to set or append' },
            mode: { type: 'string', enum: ['append', 'replace'], description: 'Tag update mode (default: "append")' },
          },
          required: ['tags'],
        },
      },
      {
        name: 'get_canvas_state',
        description: 'Read a lightweight snapshot of the currently open PicPocket canvas.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'create_canvas_node',
        description: 'Create an image draft, image reference, or text node on the currently open PicPocket canvas.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['image', 'text'] },
            prompt: { type: 'string', description: 'Prompt for an image draft' },
            imageUrl: { type: 'string', description: 'Optional image URL or data URL' },
            text: { type: 'string', description: 'Content for a text node' },
            title: { type: 'string', description: 'Optional node title' },
          },
        },
      },
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolArgs = request.params.arguments || {};

  // Check if extension is connected
  if (!activeExtensionSocket || activeExtensionSocket.readyState !== WebSocket.OPEN) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【未连接 PicPocket 插件 / Extension Not Connected】: 本地 PicPocket Chrome 插件尚未连接到 MCP Bridge。请确保已在 Chrome 中打开 PicPocket 侧边栏，并在右上角协同抽屉中确认状态为「已连通」。',
        },
      ],
    };
  }

  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const timeoutMs = toolName === 'generate_and_save_asset' ? 75000 : 15000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(callId);
      resolve({
        isError: true,
        content: [
          {
            type: 'text',
            text: `【操作超时 / Timeout】: PicPocket 插件处理工具 "${toolName}" 超过 ${Math.round(
              timeoutMs / 1000
            )} 秒无响应。`,
          },
        ],
      });
    }, timeoutMs);

    pendingCalls.set(callId, {
      resolve,
      reject: () => {},
      timer,
    });

    activeExtensionSocket!.send(
      JSON.stringify({
        type: 'tool_call',
        id: callId,
        name: toolName,
        arguments: toolArgs,
        clientName: process.env.MCP_CLIENT_NAME || 'AI Agent',
      })
    );
  });
});

async function run() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('[PicPocket MCP Bridge] Connected to stdio transport, ready for Agent requests');
}

run().catch((err) => {
  console.error('[PicPocket MCP Bridge] Fatal error in main loop:', err);
  process.exit(1);
});
