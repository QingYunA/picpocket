import { mcpManager } from './mcpCollaboration';

const MCP_OWNER_LOCK = 'picpocket-mcp-page-owner';

export function startMcpPageOwnership(): () => void {
  let released = false;
  let releaseLock: (() => void) | null = null;

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    void navigator.locks.request(
      MCP_OWNER_LOCK,
      async (lock) => {
        if (!lock || released) return;
        await mcpManager.start();
        await new Promise<void>((resolve) => {
          releaseLock = resolve;
          if (released) resolve();
        });
        mcpManager.stop();
      }
    );
  } else {
    void mcpManager.start();
  }

  return () => {
    released = true;
    if (releaseLock) releaseLock();
    else if (typeof navigator === 'undefined' || !navigator.locks?.request) mcpManager.stop();
  };
}
