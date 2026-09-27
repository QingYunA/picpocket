import React, { useState, useEffect } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { useI18n } from '@/i18n';
import type { UserSettings, CollaborationLogItem } from '@/types';
import { mcpManager, type McpConnectionState } from '@/services/mcpCollaboration';
import {
  buildTargetedPrompt,
  MCP_CLIENT_TARGETS,
  type McpClientTarget,
} from '@/services/mcpPrompts';
import { DEFAULT_MCP_SETTINGS } from '@/utils/storage';
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  XCircle,
  Shield,
  Activity,
  Code2,
  Sparkles,
  Server,
  KeyRound,
  FileCode,
} from 'lucide-react';

interface McpPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  highlightField?: string;
}

export const McpPage: React.FC<McpPageProps> = ({
  settings,
  onUpdateSettings,
  highlightField,
}) => {
  const { t } = useI18n();

  const [connectionState, setConnectionState] = useState<McpConnectionState>('disconnected');
  const [logs, setLogs] = useState<CollaborationLogItem[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<McpClientTarget>('cursor');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const mcpConfig = settings.mcpSettings || DEFAULT_MCP_SETTINGS;
  const permissions = mcpConfig.permissions;

  const [portInput, setPortInput] = useState<string>(String(mcpConfig.port || 18088));
  const [portSaveMsg, setPortSaveMsg] = useState<string>('');

  useEffect(() => {
    setPortInput(String(mcpConfig.port || 18088));

    // 1. Initial hydration from storage for cross-tab persistence
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['mcp_active_state', 'mcp_recent_logs']).then((res) => {
        if (res.mcp_active_state) {
          setConnectionState(res.mcp_active_state as McpConnectionState);
        }
        if (Array.isArray(res.mcp_recent_logs) && res.mcp_recent_logs.length > 0) {
          setLogs(res.mcp_recent_logs as CollaborationLogItem[]);
        }
      }).catch(() => {});
    }

    // 2. Local instance listener
    const unsubState = mcpManager.subscribeState((st) => {
      setConnectionState(st);
    });
    const unsubLogs = mcpManager.subscribeLogs((l) => {
      if (l.length > 0) setLogs(l);
    });

    // 3. Cross-tab storage change listener
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      if (changes.mcp_active_state?.newValue) {
        setConnectionState(changes.mcp_active_state.newValue as McpConnectionState);
      }
      if (Array.isArray(changes.mcp_recent_logs?.newValue)) {
        setLogs(changes.mcp_recent_logs.newValue as CollaborationLogItem[]);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      unsubState();
      unsubLogs();
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [mcpConfig.port]);

  const handleTogglePermission = async (key: 'read' | 'write' | 'generate') => {
    const updatedPermissions = {
      ...permissions,
      [key]: !permissions[key],
    };
    await onUpdateSettings((prev) => ({
      ...prev,
      mcpSettings: {
        ...(prev.mcpSettings || DEFAULT_MCP_SETTINGS),
        permissions: updatedPermissions,
      },
    }));
  };

  const handleSavePort = async () => {
    const parsed = parseInt(portInput, 10);
    if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
      setPortSaveMsg(t('mcp.portInvalid'));
      setTimeout(() => setPortSaveMsg(''), 3000);
      return;
    }
    await onUpdateSettings((prev) => ({
      ...prev,
      mcpSettings: {
        ...(prev.mcpSettings || DEFAULT_MCP_SETTINGS),
        port: parsed,
      },
    }));
    setPortSaveMsg(t('mcp.portSaved'));
    setTimeout(() => setPortSaveMsg(''), 3000);
  };

  const currentPort = mcpConfig.port || 18088;
  const targetedPrompt = buildTargetedPrompt(selectedTarget, mcpConfig);
  const installCliCmd = selectedTarget === 'auto'
    ? 'bun run mcp:install'
    : `bun run mcp:install ${selectedTarget}`;

  // Client configuration snippet
  const clientConfigSnippets: Record<McpClientTarget, string> = {
    cursor: JSON.stringify(
      {
        mcpServers: {
          picpocket: {
            command: 'bun',
            args: ['run', `${navigator?.userAgent?.includes('Win') ? 'C:\\path\\to' : '/path/to'}/picpocket/packages/mcp-bridge/src/index.ts`],
            env: { PICPOCKET_PORT: String(currentPort) },
          },
        },
      },
      null,
      2
    ),
    claude: `claude mcp add picpocket -- bun run /path/to/picpocket/packages/mcp-bridge/src/index.ts`,
    antigravity: JSON.stringify(
      {
        mcpServers: {
          picpocket: {
            command: 'bun',
            args: ['run', '/path/to/picpocket/packages/mcp-bridge/src/index.ts'],
            env: { PICPOCKET_PORT: String(currentPort) },
          },
        },
      },
      null,
      2
    ),
    windsurf: JSON.stringify(
      {
        mcpServers: {
          picpocket: {
            command: 'bun',
            args: ['run', '/path/to/picpocket/packages/mcp-bridge/src/index.ts'],
            env: { PICPOCKET_PORT: String(currentPort) },
          },
        },
      },
      null,
      2
    ),
    zed: JSON.stringify(
      {
        context_servers: {
          picpocket: {
            command: {
              path: 'bun',
              args: ['run', '/path/to/picpocket/packages/mcp-bridge/src/index.ts'],
              env: { PICPOCKET_PORT: String(currentPort) },
            },
          },
        },
      },
      null,
      2
    ),
    auto: `# Run automated MCP injection script:\n${installCliCmd}`,
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(targetedPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyCli = () => {
    navigator.clipboard.writeText(installCliCmd);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(clientConfigSnippets[selectedTarget]);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <ConfigLayout
      title={t('options.mcp.title')}
      description={t('options.mcp.description')}
      actions={
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              connectionState === 'connected'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
              }`}
            />
            <span>
              {connectionState === 'connected' ? t('mcp.connected') : t('mcp.disconnected')}
            </span>
          </div>
        </div>
      }
    >
      {/* 1. Service Connection & Port */}
      <ConfigSection
        title={t('mcp.serviceTitle')}
        description={t('mcp.serviceDesc')}
        icon={<Server className="h-4 w-4" />}
      >
        <ConfigItem
          title={t('mcp.portLabel')}
          description={t('mcp.portDesc')}
          highlight={highlightField === 'port'}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              className="w-28 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSavePort}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 shadow-2xs transition-colors cursor-pointer"
            >
              {t('common.save')}
            </button>
            {portSaveMsg && (
              <span className="text-xs text-emerald-600 font-medium">{portSaveMsg}</span>
            )}
          </div>
        </ConfigItem>
      </ConfigSection>

      {/* 2. Permissions Management */}
      <ConfigSection
        title={t('mcp.permissionsTitle')}
        description={t('mcp.permissionsDesc')}
        icon={<Shield className="h-4 w-4" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3">
          {[
            {
              key: 'read' as const,
              title: t('mcp.permReadTitle'),
              desc: t('mcp.permReadDesc'),
              enabled: permissions.read,
            },
            {
              key: 'write' as const,
              title: t('mcp.permWriteTitle'),
              desc: t('mcp.permWriteDesc'),
              enabled: permissions.write,
            },
            {
              key: 'generate' as const,
              title: t('mcp.permGenerateTitle'),
              desc: t('mcp.permGenerateDesc'),
              enabled: permissions.generate,
            },
          ].map((perm) => (
            <div
              key={perm.key}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                perm.enabled
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-zinc-200 bg-zinc-50/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-zinc-900">{perm.title}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perm.enabled}
                      onChange={() => handleTogglePermission(perm.key)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                  </label>
                </div>
                <p className="text-[11px] text-zinc-500 leading-normal">{perm.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* 3. Client Setup Workstation (Wide Screen Tabs & Code Blocks) */}
      <ConfigSection
        title={t('mcp.setupTitle')}
        description={t('mcp.setupDesc')}
        icon={<Terminal className="h-4 w-4" />}
      >
        <div className="py-4 space-y-4">
          {/* Client Target Picker */}
          <div className="flex flex-wrap gap-2">
            {MCP_CLIENT_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => setSelectedTarget(target.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedTarget === target.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                }`}
              >
                {target.label}
              </button>
            ))}
          </div>

          {/* Quick CLI Command Box */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-900 text-zinc-100 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('mcp.installCliTitle')} (Terminal)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyCli}
                className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedCli ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedCli ? t('mcp.copiedCmd') : t('mcp.copyCmd')}</span>
              </button>
            </div>
            <pre className="font-mono text-xs text-emerald-400 overflow-x-auto py-1">
              {installCliCmd}
            </pre>
          </div>

          {/* JSON Config Snippet */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span className="flex items-center gap-1.5 font-medium">
                <FileCode className="h-3.5 w-3.5 text-zinc-500" />
                <span>{t('mcp.manualConfigTitle')} ({MCP_CLIENT_TARGETS.find((t) => t.id === selectedTarget)?.configPathHint})</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-900 font-semibold cursor-pointer"
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                  <span>{copiedPrompt ? t('mcp.copiedAgentPrompt') : t('mcp.copyAgentPrompt')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-900 font-semibold cursor-pointer"
                >
                  {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedJson ? t('mcp.copiedConfig') : t('mcp.copyConfig')}</span>
                </button>
              </div>
            </div>
            <pre className="font-mono text-xs bg-white p-3 rounded-lg border border-zinc-200/80 text-zinc-800 overflow-x-auto max-h-56">
              {clientConfigSnippets[selectedTarget]}
            </pre>
          </div>
        </div>
      </ConfigSection>

      {/* 4. Structured Audit Log Terminal */}
      <ConfigSection
        title={t('mcp.logsTitle')}
        description={t('mcp.logsDesc')}
        icon={<Activity className="h-4 w-4" />}
        actions={
          logs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                mcpManager.clearLogs();
                setLogs([]);
                if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                  chrome.storage.local.set({ mcp_recent_logs: [] }).catch(() => {});
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('mcp.clearLogs')}</span>
            </button>
          )
        }
      >
        <div className="py-4">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              <Activity className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
              <p>{t('mcp.noLogs')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-sans text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">{t('mcp.logTime')}</th>
                    <th className="py-2.5 px-3">{t('mcp.logTool')}</th>
                    <th className="py-2.5 px-3">{t('mcp.logClient')}</th>
                    <th className="py-2.5 px-3">{t('mcp.logDuration')}</th>
                    <th className="py-2.5 px-3">{t('mcp.logStatus')}</th>
                    <th className="py-2.5 px-3">{t('mcp.logDetail')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-zinc-400 text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-zinc-900 whitespace-nowrap">
                        {log.toolName}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 whitespace-nowrap">
                        {log.clientName || 'MCP Client'}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                        {log.durationMs ? `${log.durationMs}ms` : '-'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{t('mcp.statusSuccess')}</span>
                          </span>
                        ) : log.status === 'blocked' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            <Shield className="h-3 w-3" />
                            <span>{t('mcp.statusBlocked')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                            <XCircle className="h-3 w-3" />
                            <span>{t('mcp.statusFailed')}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 max-w-xs truncate">
                        {log.summary || log.detail || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ConfigSection>
    </ConfigLayout>
  );
};
