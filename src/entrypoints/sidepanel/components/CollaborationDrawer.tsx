import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Terminal,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Activity,
  Code2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Wrench,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import type { UserSettings, CollaborationLogItem } from '@/types';
import { useI18n } from '@/i18n';
import { mcpManager, type McpConnectionState } from '@/services/mcpCollaboration';
import {
  buildTargetedPrompt,
  MCP_CLIENT_TARGETS,
  type McpClientTarget,
} from '@/services/mcpPrompts';
import { getUserSettings, saveUserSettings, DEFAULT_MCP_SETTINGS } from '@/utils/storage';
import { openOptionsPage } from '@/utils/navigation';

interface CollaborationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

export const CollaborationDrawer: React.FC<CollaborationDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const [connectionState, setConnectionState] = useState<McpConnectionState>('disconnected');
  const [logs, setLogs] = useState<CollaborationLogItem[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<McpClientTarget>('auto');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedInstallCli, setCopiedInstallCli] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [showManualConfig, setShowManualConfig] = useState(false);

  const mcpConfig = settings.mcpSettings || DEFAULT_MCP_SETTINGS;
  const permissions = mcpConfig.permissions;

  const [portInput, setPortInput] = useState<string>(String(mcpConfig.port || 18088));
  const [portSaveMsg, setPortSaveMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPortInput(String(mcpConfig.port || 18088));
    const unsubState = mcpManager.subscribeState(setConnectionState);
    const unsubLogs = mcpManager.subscribeLogs(setLogs);
    return () => {
      unsubState();
      unsubLogs();
    };
  }, [isOpen, mcpConfig.port]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 只写 mcpSettings 一项，且基于存储里最新的值：避免用面板持有的旧 settings 覆盖设置页刚改的渠道、Key 等
  const handleTogglePermission = async (key: 'read' | 'write' | 'generate') => {
    const latest = (await getUserSettings()).mcpSettings || DEFAULT_MCP_SETTINGS;
    const saved = await saveUserSettings({
      mcpSettings: {
        ...latest,
        permissions: { ...latest.permissions, [key]: !latest.permissions[key] },
      },
    });
    onUpdateSettings(saved);
  };

  const handleSavePort = async () => {
    const parsed = parseInt(portInput, 10);
    if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
      setPortSaveMsg({ text: t('mcp.portInvalid'), isError: true });
      setTimeout(() => setPortSaveMsg(null), 3000);
      return;
    }
    const latest = (await getUserSettings()).mcpSettings || DEFAULT_MCP_SETTINGS;
    const saved = await saveUserSettings({ mcpSettings: { ...latest, port: parsed } });
    onUpdateSettings(saved);
    await mcpManager.restart();
    setPortSaveMsg({ text: t('mcp.portSaved'), isError: false });
    setTimeout(() => setPortSaveMsg(null), 2500);
  };

  const currentPrompt = buildTargetedPrompt(selectedTarget, mcpConfig);

  const installCliCommand =
    selectedTarget === 'auto'
      ? `bun run mcp:install${mcpConfig.port !== 18088 ? ` --port ${mcpConfig.port}` : ''}`
      : `bun run mcp:install ${selectedTarget}${mcpConfig.port !== 18088 ? ` --port ${mcpConfig.port}` : ''}`;

  const bridgeCommand =
    mcpConfig.port !== 18088 ? `bun run mcp --port ${mcpConfig.port}` : 'bun run mcp';

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        picpocket: {
          command: 'bun',
          args:
            mcpConfig.port !== 18088
              ? ['packages/mcp-bridge/src/index.ts', '--port', String(mcpConfig.port)]
              : ['packages/mcp-bridge/src/index.ts'],
        },
      },
    },
    null,
    2
  );

  // 写入剪贴板成功后才显示「已复制」，被浏览器拒绝时不误导用户
  const copyText = async (text: string, markCopied: (copied: boolean) => void, resetMs = 2000) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
      return;
    }
    markCopied(true);
    setTimeout(() => markCopied(false), resetMs);
  };

  const handleCopyPrompt = () => copyText(currentPrompt, setCopiedPrompt, 2500);
  const handleCopyInstallCli = () => copyText(installCliCommand, setCopiedInstallCli);
  const handleCopyCmd = () => copyText(bridgeCommand, setCopiedCmd);
  const handleCopyConfig = () => copyText(mcpConfigJson, setCopiedConfig);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('mcp.drawerTitle')}
        className="h-full w-full max-w-[390px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 border-l border-zinc-200/80"
      >
        {/* Header */}
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-zinc-100 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/50">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-zinc-900 leading-tight truncate">
                {t('mcp.drawerTitle')}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {connectionState === 'connected' ? (
                  <span className="inline-flex max-w-full items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="truncate">{t('mcp.statusConnected')} (127.0.0.1:{mcpConfig.port})</span>
                  </span>
                ) : connectionState === 'connecting' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                    {t('mcp.statusConnecting')}
                  </span>
                ) : connectionState === 'error' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {t('mcp.statusError')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    {t('mcp.statusDisconnected')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                openOptionsPage({ route: '/mcp' });
              }}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
              title={t('mcp.openInSettings')}
              aria-label={t('mcp.openInSettings')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 text-xs">
          {/* Target Client Tabs (定向选择) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-700">
              <span className="flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-zinc-500" />
                {t('mcp.clientTargetLabel')}
              </span>
              <span className="text-[10px] text-zinc-400">
                {MCP_CLIENT_TARGETS.find((c) => c.id === selectedTarget)?.configPathHint}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100/80 border border-zinc-200/60">
              {MCP_CLIENT_TARGETS.map((client) => {
                const isSelected = selectedTarget === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedTarget(client.id)}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-medium transition-all text-center truncate cursor-pointer ${
                      isSelected
                        ? 'bg-white text-emerald-700 shadow-xs font-bold border border-emerald-200'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                    }`}
                  >
                    {client.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1. Primary Hero Card: Targeted Prompt-Driven Setup */}
          <div className="rounded-xl border-2 border-emerald-500/20 bg-gradient-to-b from-emerald-50/60 to-white p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-900 flex items-center gap-1.5 text-[12px]">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 fill-emerald-100" />
                {t('mcp.copyAgentPrompt')}
              </span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                {t('mcp.agentPromptBadge')}
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              {t('mcp.agentPromptDesc')}
            </p>
            <button
              onClick={handleCopyPrompt}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-medium text-xs transition-all cursor-pointer shadow-xs ${
                copiedPrompt
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.99]'
              }`}
            >
              {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedPrompt ? t('mcp.copiedAgentPrompt') : t('mcp.copyAgentPrompt')}</span>
            </button>
          </div>

          {/* 2. Secondary Card: Local CLI Targeted Injection & Bridge Launch */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 space-y-2.5">
            {/* mcp:install CLI */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-zinc-500" />
                  {t('mcp.installCliTitle')}
                </span>
                <button
                  onClick={handleCopyInstallCli}
                  className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  {copiedInstallCli ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedInstallCli ? t('mcp.copiedInstallCli') : t('mcp.copyInstallCli')}
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-emerald-400">
                <span className="truncate">{installCliCommand}</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight">
                {t('mcp.installCliDesc')}
              </p>
            </div>

            <div className="h-px bg-zinc-200/60" />

            {/* bun run mcp Bridge */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                  {t('mcp.terminalCmdTitle')}
                </span>
                <button
                  onClick={handleCopyCmd}
                  className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  {copiedCmd ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedCmd ? t('mcp.copiedCmd') : t('mcp.copyCmd')}
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-emerald-400">
                <span>{bridgeCommand}</span>
                <span className="text-zinc-500 text-[10px]">{t('mcp.portLabel', { port: mcpConfig.port })}</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight">
                {t('mcp.terminalCmdHint')}
              </p>
            </div>
          </div>

          {/* 3. Port Configuration & Defense (服务端口配置与冲突自愈) */}
          <div className="rounded-xl border border-zinc-200/80 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 flex items-center gap-1.5 text-[11px]">
                <Sliders className="h-3.5 w-3.5 text-zinc-500" />
                {t('mcp.portSettingTitle')}
              </span>
              {portSaveMsg && (
                <span
                  role={portSaveMsg.isError ? 'alert' : 'status'}
                  className={`text-[10px] font-medium animate-in fade-in duration-150 ${
                    portSaveMsg.isError ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {portSaveMsg.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1024"
                max="65535"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSavePort();
                }}
                aria-label={t('mcp.portSettingTitle')}
                className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-mono text-zinc-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="18088"
              />
              <button
                onClick={handleSavePort}
                className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-[11px] transition-colors cursor-pointer"
              >
                {t('mcp.portSave')}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              {t('mcp.portSettingDesc')}
            </p>
          </div>

          {/* 4. Permissions Section */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-zinc-900 font-bold">
              <Shield className="h-3.5 w-3.5 text-zinc-600" />
              <span>{t('mcp.permissionsTitle')}</span>
            </div>

            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-2.5">
              {/* Read Permission */}
              <label className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer">
                <div>
                  <p className="font-semibold text-zinc-800 text-[11px]">{t('mcp.permRead')}</p>
                  <p className="text-[10px] text-zinc-500 leading-tight">{t('mcp.permReadDesc')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.read}
                  onChange={() => handleTogglePermission('read')}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              <div className="h-px bg-zinc-100" />

              {/* Write Permission */}
              <label className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer">
                <div>
                  <p className="font-semibold text-zinc-800 text-[11px]">{t('mcp.permWrite')}</p>
                  <p className="text-[10px] text-zinc-500 leading-tight">{t('mcp.permWriteDesc')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.write}
                  onChange={() => handleTogglePermission('write')}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              <div className="h-px bg-zinc-100" />

              {/* Generate Permission */}
              <label className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-zinc-800 text-[11px]">{t('mcp.permGenerate')}</p>
                    <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-medium text-amber-800">
                      {t('mcp.consumeQuotaBadge')}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">{t('mcp.permGenerateDesc')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.generate}
                  onChange={() => handleTogglePermission('generate')}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* 5. Advanced: Manual Config Snippet (Collapsible) */}
          <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
            <button
              onClick={() => setShowManualConfig(!showManualConfig)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-zinc-500" />
                {t('mcp.manualConfigTitle')}
              </span>
              {showManualConfig ? (
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </button>

            {showManualConfig && (
              <div className="p-3 pt-0 space-y-2 border-t border-zinc-100">
                <div className="flex items-center justify-end mt-2">
                  <button
                    onClick={handleCopyConfig}
                    className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                  >
                    {copiedConfig ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedConfig ? t('mcp.copiedConfig') : t('mcp.copyConfig')}
                  </button>
                </div>
                <pre className="rounded-lg border border-zinc-200 bg-zinc-950 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-200 overflow-x-auto">
                  {mcpConfigJson}
                </pre>
                <p className="text-[10px] text-zinc-400">{t('mcp.configTip')}</p>
              </div>
            )}
          </div>

          {/* 6. Live Activity Stream */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-zinc-600" />
                {t('mcp.logsTitle')}
              </span>
              {logs.length > 0 && (
                <button
                  onClick={() => mcpManager.clearLogs()}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('mcp.clearLogs')}
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-zinc-400 text-[11px]">
                {t('mcp.noLogs')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {logs.map((log) => {
                  const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={log.id}
                      className="rounded-lg border border-zinc-100 bg-zinc-50/70 p-2 text-[10px] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : log.status === 'blocked' ? (
                            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                          )}
                          <span className="font-mono font-semibold text-zinc-800">
                            {log.toolName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[9px]">
                          <span>{log.durationMs}ms</span>
                          <span>·</span>
                          <span>{timeStr}</span>
                        </div>
                      </div>
                      <p className="text-zinc-600 text-[10px] leading-tight truncate">
                        {log.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
