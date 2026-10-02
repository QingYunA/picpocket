import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Camera,
  Settings,
  Sparkles,
  Trash2,
  Folder,
  AlertCircle,
  X,
  Wand2,
  Smile,
  FolderInput,
  Check,
  Bot,
  Maximize2,
  KeyRound,
  UserRound,
  LayoutDashboard,
} from 'lucide-react';
import type { InspirationItem, UserSettings, FolderFilter } from '@/types';
import { db, moveItemToFolder, batchMoveItemsToFolder, batchDeleteItems } from '@/db';
import {
  getUserSettings,
  saveUserSettings,
  getInitialActiveTab,
  getActiveTab,
  saveActiveTab,
  getActiveAnalysis,
  getActiveFolder,
  setActiveFolder,
  onActiveFolderChange,
  getPendingAutoAnalyzeItemId,
  setPendingAutoAnalyzeItemId,
  type SidepanelTab,
} from '@/utils/storage';
import { useI18n, type TranslationKey } from '@/i18n';
import { mcpManager, type McpConnectionState } from '@/services/mcpCollaboration';
import { startMcpPageOwnership } from '@/services/mcpPageOwnership';
import { InspectorDrawer } from './components/InspectorDrawer';
import { openInfiniteCanvasPage, openOptionsPage } from '@/utils/navigation';
import { CollaborationDrawer } from './components/CollaborationDrawer';
import { PromptLibraryView } from './components/PromptLibraryView';
import { MemeLibraryView } from './components/MemeLibraryView';
import { ImageWorkbenchView } from './components/ImageWorkbenchView';
import { FolderNav } from './components/FolderNav';
import { ConfirmModal } from './components/ConfirmModal';
import { CardActionPopover } from './components/CardActionPopover';
import { BatchActionBar } from './components/BatchActionBar';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { ProSubscriptionModal } from './components/ProSubscriptionModal';
import { AccountDialog } from './components/AccountDialog';
import { GettingStartedCard } from './components/GettingStartedCard';
import { AccountAvatar } from './components/AccountAvatar';
import { useAuth } from '@/hooks/useAuth';
import { isProActive } from '@/services/billing';
import { isAiGeneratedItem, isAgentCollabItem } from '@/utils/itemHelpers';

const ALL_CATEGORY_KEY = '__ALL__';

const TAG_I18N_MAP: Record<string, TranslationKey> = {
  '网页采集': 'categories.webCapture',
  '选区截图': 'categories.snipCapture',
  '全屏截图': 'categories.fullCapture',
  '已反推': 'categories.analyzed',
  '待反推': 'categories.pending',
  'AI生图': 'categories.aiGenerated',
  'Agent协同': 'categories.agentGenerated',
};

function formatTag(tagKey: string | undefined, t: (path: TranslationKey) => string): string {
  if (!tagKey) return t('categories.defaultTag');
  if (tagKey === ALL_CATEGORY_KEY) return t('categories.all');
  if (TAG_I18N_MAP[tagKey]) return t(TAG_I18N_MAP[tagKey]);
  return tagKey;
}

export default function App() {
  const { t } = useI18n();

  const [selectedItem, setSelectedItem] = useState<InspirationItem | null>(null);
  const [activeTab, setActiveTabState] = useState<SidepanelTab>(() => getInitialActiveTab());

  const handleSetActiveTab = (tab: SidepanelTab) => {
    setActiveTabState(tab);
    saveActiveTab(tab).catch(() => {});
  };

  const [selectedFolderId, setSelectedFolderId] = useState<FolderFilter>('all');

  useEffect(() => {
    getActiveTab().then((storedTab) => {
      if (storedTab && storedTab !== activeTab) {
        setActiveTabState(storedTab);
      }
    });

    getActiveFolder().then((storedFolder) => {
      if (storedFolder) {
        if (typeof storedFolder.id === 'number') {
          setSelectedFolderId(storedFolder.id);
        } else if (storedFolder.id === 'inbox') {
          setSelectedFolderId('uncategorized');
        } else {
          setSelectedFolderId('all');
        }
      }
    });

    // 跨标签页/画布实时同步活跃文件夹变更
    const unbindFolderChange = onActiveFolderChange((newFolder) => {
      if (!newFolder) {
        setSelectedFolderId('all');
      } else if (typeof newFolder.id === 'number') {
        setSelectedFolderId(newFolder.id);
      } else if (newFolder.id === 'inbox') {
        setSelectedFolderId('uncategorized');
      } else {
        setSelectedFolderId('all');
      }
    });

    // 检查是否有后台刚刚触发反推的素材，若有则秒级对接打开详情抽屉
    getPendingAutoAnalyzeItemId().then(async (pendingId) => {
      if (pendingId) {
        await setPendingAutoAnalyzeItemId(null);
        const pendingItem = await db.items.get(pendingId);
        if (pendingItem) {
          setSelectedItem(pendingItem);
          setLaunchAnalysisItemId(pendingItem.id ?? null);
        }
      }
    });

    return () => {
      unbindFolderChange();
    };
  }, []);
  const [isFolderNavOpen, setIsFolderNavOpen] = useState(false);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { user: accountUser } = useAuth();

  // In-context filing pill state (when collecting into a specific folder)
  const [pendingCollectedIds, setPendingCollectedIds] = useState<number[]>([]);
  const [filingSuccessMsg, setFilingSuccessMsg] = useState<string | null>(null);
  const [microSavedTip, setMicroSavedTip] = useState<string | null>(null);

  // Batch selection mode state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isBatchMovePopoverOpen, setIsBatchMovePopoverOpen] = useState(false);

  // Single card move popover
  const [movingItem, setMovingItem] = useState<InspirationItem | null>(null);

  // High-resolution image lightbox preview
  const [lightboxItem, setLightboxItem] = useState<InspirationItem | null>(null);

  const [generatorPreset, setGeneratorPreset] = useState<{
    prompt: string;
    referenceImage?: string;
  } | null>(null);
  const [launchAnalysisItemId, setLaunchAnalysisItemId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY_KEY);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [mcpState, setMcpState] = useState<McpConnectionState>('disconnected');
  const [toastTip, setToastTip] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    autoAnalyzeOnCapture: false,
    language: 'zh',
    enableHoverBadge: true,
    hoverBadgePromptDismissed: false,
    contextMenuMode: 'direct-analyze',
  });

  // Reactive IndexedDB query
  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray()) || [];
  // 新手引导：保存并反推过一张图之前一直显示，可手动关闭
  const hasAnalyzedItem = items.some((item) => item.status === 'analyzed');
  const showGettingStarted = !settings.gettingStartedDismissed && !(items.length > 0 && hasAnalyzedItem);

  // MCP Service Lifecycle
  useEffect(() => {
    const stopMcpOwnership = startMcpPageOwnership();
    const unsub = mcpManager.subscribeState(setMcpState);
    return () => {
      unsub();
      stopMcpOwnership();
    };
  }, []);

  useEffect(() => {
    getUserSettings().then((s) => {
      setSettings(s);
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const handleStorageChange = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
      ) => {
        if (areaName === 'local' && changes['promptsnap_settings']?.newValue) {
          const updated = changes['promptsnap_settings'].newValue as UserSettings;
          setSettings(updated);
        }
        if (areaName === 'local' && changes['mcp_active_state']?.newValue) {
          setMcpState(changes['mcp_active_state'].newValue as McpConnectionState);
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  const handleHoverBadgeChoice = async (enable: boolean) => {
    const updated = await saveUserSettings({
      enableHoverBadge: enable,
      hoverBadgePromptDismissed: true,
    });
    setSettings(updated);
  };

  const handleDismissGettingStarted = async () => {
    setSettings(await saveUserSettings({ gettingStartedDismissed: true }));
  };

  const handleTriggerGenerate = (promptText: string, refImage?: string) => {
    setGeneratorPreset({ prompt: promptText, referenceImage: refImage });
    handleSetActiveTab('generator');
    setSelectedItem(null);
  };

  // Listen for newly added items to auto open or refresh drawer, or trigger in-context pill
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const listener = (msg: any) => {
      if (msg.action === 'ITEM_ADDED' && msg.id) {
        db.items.get(msg.id).then(async (newItem) => {
          if (newItem) {
            let targetName = msg.folderName;
            if (!targetName && typeof newItem.folderId === 'number') {
              const folder = await db.folders.get(newItem.folderId);
              targetName = folder?.name;
            }
            const folderLabel = targetName || t('webCapsule.uncategorized');

            // Only auto-open drawer and start analysis if autoAnalyze was explicitly requested
            if (msg.autoAnalyze) {
              // 侧边栏热启动收到消息时，立即清除 Storage 中的 Pending ID，防止后续冷启动挂载重新打开陈旧抽屉
              await setPendingAutoAnalyzeItemId(null);
              setSelectedItem(newItem);
              setLaunchAnalysisItemId(newItem.id ?? null);
              setMicroSavedTip(t('pill.savedAndAnalyzingToFolder', { name: folderLabel }));
              setTimeout(() => {
                setMicroSavedTip((curr) => (curr ? null : curr));
              }, 2500);
            } else {
              // 提示用户保存的具体文件夹
              setMicroSavedTip(t('pill.savedToFolder', { name: folderLabel }));
              setTimeout(() => {
                setMicroSavedTip((curr) => (curr ? null : curr));
              }, 2000);
            }
          }
        });
      }

      if (msg.action === 'ITEM_FOLDER_UPDATED' && msg.itemId) {
        setPendingCollectedIds((prev) => prev.filter((id) => id !== msg.itemId));
      }

      if (
        msg.action === 'ANALYSIS_COMPLETED' ||
        msg.action === 'ANALYSIS_FAILED' ||
        msg.action === 'ANALYSIS_CANCELLED'
      ) {
        if (msg.itemId && selectedItem?.id === msg.itemId) {
          db.items.get(msg.itemId).then((updated) => {
            if (updated) setSelectedItem(updated);
          });
        }
      }

    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [selectedFolderId, selectedItem?.id, t]);

  // 挂载时自愈：核对数据库中所有 analyzing 状态的 item，清理悬挂任务
  useEffect(() => {
    async function reconcileStaleAnalyzingItems() {
      try {
        const analyzingItems = await db.items.where('status').equals('analyzing').toArray();
        if (analyzingItems.length === 0) return;

        const active = await getActiveAnalysis();
        for (const it of analyzingItems) {
          const isRunning = Boolean(
            active &&
            active.itemId === it.id &&
            Date.now() - (active.startTime || 0) < 180000
          );
          if (!isRunning && it.id) {
            console.warn(`[PicPocket Sidepanel] 自愈重置悬挂反推任务: item #${it.id}`);
            await db.items.update(it.id, { status: 'pending' });
          }
        }
      } catch (err) {
        console.error('Failed to reconcile stale analyzing items in sidepanel:', err);
      }
    }

    reconcileStaleAnalyzingItems();
  }, []);

  const handleSelectFolder = async (fId: FolderFilter) => {
    setSelectedFolderId(fId);
    setPendingCollectedIds([]);
    setFilingSuccessMsg(null);
    if (typeof fId === 'number') {
      await setActiveFolder({ id: fId });
    } else if (fId === 'uncategorized') {
      await setActiveFolder({ id: 'inbox' });
    } else {
      await setActiveFolder({ id: null });
    }
  };

  const handleMovePendingToCurrentFolder = async () => {
    if (typeof selectedFolderId !== 'number' || pendingCollectedIds.length === 0) return;
    try {
      await batchMoveItemsToFolder(pendingCollectedIds, selectedFolderId);
      setFilingSuccessMsg(t('pill.movedSuccess'));
      setTimeout(() => {
        setPendingCollectedIds([]);
        setFilingSuccessMsg(null);
      }, 1600);
    } catch (err) {
      console.error('Failed to move items to folder:', err);
    }
  };

  const handleViewPendingInAll = () => {
    handleSelectFolder('all');
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!isBatchMode) setIsBatchMode(true);
  };

  const handleSelectAll = () => {
    const allIds = filteredItems.map((i) => i.id!).filter(Boolean);
    setSelectedIds(new Set(allIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleExitBatchMode = () => {
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setIsBatchMovePopoverOpen(false);
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      await batchDeleteItems(Array.from(selectedIds));
      handleExitBatchMode();
    } catch (err) {
      console.error('Failed to batch delete:', err);
    } finally {
      setIsBatchDeleteModalOpen(false);
    }
  };

  const showTip = (text: string) => {
    setToastTip(text);
    setTimeout(() => {
      setToastTip((curr) => (curr === text ? null : curr));
    }, 3000);
  };

  const getDisplayTagName = (tagKey: string) => formatTag(tagKey, t);

  // Filter items by folder, active tag & search term
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Folder match
      if (selectedFolderId === 'uncategorized') {
        if (item.folderId != null) return false;
      } else if (selectedFolderId !== 'all') {
        if (item.folderId !== selectedFolderId) return false;
      }

      // 2. Category tag match
      const matchesCategory =
        activeCategory === ALL_CATEGORY_KEY || item.tags?.includes(activeCategory);

      // 3. Search query match
      const matchesSearch =
        !searchQuery ||
        (item.pageTitle && item.pageTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

      return matchesCategory && matchesSearch;
    });
  }, [items, selectedFolderId, activeCategory, searchQuery]);

  // Dynamic tags with counts
  const categories = useMemo(() => {
    const counts: Record<string, number> = { [ALL_CATEGORY_KEY]: items.length };
    items.forEach((item) => {
      item.tags?.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts);
  }, [items]);

  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const handleDeleteItem = (e: React.MouseEvent, id?: number) => {
    e.stopPropagation();
    if (!id) return;
    setItemToDelete(id);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await db.items.delete(itemToDelete);
      await db.prompts.where('itemId').equals(itemToDelete).delete();
      if (selectedItem?.id === itemToDelete) {
        setSelectedItem(null);
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    } finally {
      setItemToDelete(null);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white overflow-hidden text-zinc-900">
      {/* If an item is selected, show InspectorDrawer */}
      {selectedItem ? (
        <InspectorDrawer
          item={selectedItem}
          settings={settings}
          autoStartAnalysis={launchAnalysisItemId === selectedItem.id}
          onBack={() => {
            setSelectedItem(null);
            setLaunchAnalysisItemId(null);
          }}
          onOpenSettings={() => openOptionsPage({ route: '/models/vision' })}
          onGeneratePrompt={handleTriggerGenerate}
          onOpenLightbox={() => setLightboxItem(selectedItem)}
          onMoveToFolder={() => setMovingItem(selectedItem)}
        />
      ) : (
        <>
          {/* Header */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-100 px-2 gap-2">
            {/* Navigation Tabs (Expanded breathing space, icon + label permanently visible) */}
            <div className="flex items-center min-w-0 flex-1">
              <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200/60 w-full">
                {[
                  {
                    id: 'gallery' as const,
                    label: t('nav.gallery'),
                    icon: <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />,
                    badge: items.length,
                  },
                  {
                    id: 'prompts' as const,
                    label: t('nav.prompts'),
                    icon: <Sparkles className="h-3.5 w-3.5 text-sky-500 shrink-0" />,
                  },
                  {
                    id: 'memes' as const,
                    label: t('nav.memes'),
                    icon: <Smile className="h-3.5 w-3.5 text-emerald-500 shrink-0" />,
                  },
                  {
                    id: 'generator' as const,
                    label: t('nav.generator'),
                    icon: <Wand2 className="h-3.5 w-3.5 text-violet-500 shrink-0" />,
                  },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleSetActiveTab(tab.id)}
                      title={tab.badge !== undefined ? `${tab.label} (${tab.badge})` : tab.label}
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1 px-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap min-w-0 shrink-0 ${
                        isActive
                          ? 'flex-[2] bg-white text-zinc-900 shadow-2xs font-semibold'
                          : 'flex-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/40'
                      }`}
                    >
                      {tab.icon}
                      <span
                        className={`text-[11px] font-medium whitespace-nowrap ${
                          isActive ? 'inline' : 'hidden min-[480px]:inline'
                        }`}
                      >
                        {tab.label}
                      </span>
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span className={`rounded-full bg-zinc-200/80 px-1 py-0.2 text-[9px] font-mono font-semibold text-zinc-600 ${isActive ? '' : 'hidden min-[480px]:inline'}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Header Right Tools: Prominent Canvas entry + Compact icon buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {/* PicPocket Canvas Entry Button (Prominent & Accessible anywhere) */}
              <button
                onClick={() => openInfiniteCanvasPage().catch(console.warn)}
                className="flex h-7 items-center gap-1 px-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 hover:text-indigo-900 transition-all cursor-pointer shrink-0 shadow-2xs group"
                title={t('workbench.openCanvasTooltip')}
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600 transition-transform group-hover:scale-110" />
                <span className="hidden min-[480px]:inline text-[11px] font-semibold">{t('workbench.canvasTab')}</span>
              </button>

              {/* License Key / Quota Status Icon Button */}
              <button
                onClick={() => setIsProModalOpen(true)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all cursor-pointer shrink-0 relative ${
                  isProActive(settings)
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs'
                    : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 shadow-2xs'
                }`}
                title={
                  isProActive(settings)
                    ? `${t('subscription.activeStatus')} (${settings.proMembership?.licenseKey || ''})`
                    : t('subscription.hasLicenseKey')
                }
              >
                <KeyRound className="h-3.5 w-3.5" />
                {isProActive(settings) && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                )}
              </button>

              {/* AI Agent Collaboration Button */}
              <button
                onClick={() => setIsCollaborationOpen(true)}
                className="relative flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors cursor-pointer shrink-0"
                title={mcpState === 'connected' ? t('mcp.tooltipConnected') : t('mcp.tooltipDisconnected')}
              >
                <Bot className="h-3.5 w-3.5" />
                <span
                  className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full transition-colors ${
                    mcpState === 'connected'
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                      : mcpState === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : mcpState === 'error'
                      ? 'bg-rose-500'
                      : 'bg-zinc-300'
                  }`}
                />
              </button>

              {/* Settings Button */}
              <button
                onClick={() => openOptionsPage()}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors cursor-pointer shrink-0"
                title={t('header.modelSettings')}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              {/* Account Button */}
              <button
                onClick={() => setIsAccountOpen(true)}
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors cursor-pointer shrink-0"
                title={accountUser ? accountUser.email || accountUser.name : t('account.signIn')}
              >
                {accountUser ? (
                  <AccountAvatar user={accountUser} sizeClass="h-6 w-6" textClass="text-[11px]" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </header>

          {activeTab === 'prompts' ? (
            <PromptLibraryView onGeneratePrompt={handleTriggerGenerate} />
          ) : activeTab === 'memes' ? (
            <MemeLibraryView />
          ) : activeTab === 'generator' ? (
            <ImageWorkbenchView
              settings={settings}
              initialPrompt={generatorPreset?.prompt}
              initialReferenceImage={generatorPreset?.referenceImage}
              onOpenSettings={() => openOptionsPage({ route: '/models/image' })}
            />
          ) : (
            <>
              {/* Pocket Multi-Level Folders Nav Component with Capture button */}
              <FolderNav
                selectedFolderId={selectedFolderId}
                onSelectFolder={handleSelectFolder}
                isOpen={isFolderNavOpen}
                onToggleOpen={() => setIsFolderNavOpen(!isFolderNavOpen)}
                onBatchMoved={handleExitBatchMode}
                isBatchMode={isBatchMode}
                onToggleBatchMode={() => {
                  if (isBatchMode) {
                    handleExitBatchMode();
                  } else {
                    setIsBatchMode(true);
                  }
                }}
                showSearch={showSearch}
                onToggleSearch={() => setShowSearch(!showSearch)}
              />

              {/* In-Context Ingestion Filing Pill (when in specific folder) */}
              {typeof selectedFolderId === 'number' && (pendingCollectedIds.length > 0 || filingSuccessMsg) && (
                <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50/95 px-3 py-1.5 text-xs text-sky-950 shadow-xs animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="truncate font-medium text-[11px]">
                      {filingSuccessMsg || t('pill.newCollected', { count: pendingCollectedIds.length })}
                    </span>
                  </div>
                  {!filingSuccessMsg ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={handleMovePendingToCurrentFolder}
                        className="rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-zinc-800 transition-colors cursor-pointer shadow-2xs"
                      >
                        {t('pill.moveToCurrent')}
                      </button>
                      <button
                        onClick={handleViewPendingInAll}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                      >
                        {t('pill.view')}
                      </button>
                      <button
                        onClick={() => setPendingCollectedIds([])}
                        className="text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer ml-0.5"
                        aria-label={t('common.close')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  )}
                </div>
              )}

              {/* Micro Saved Feedback Pill for All / Uncategorized */}
              {microSavedTip && (
                <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/95 px-3 py-1.5 text-xs text-emerald-900 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium text-[11px]">{microSavedTip}</span>
                </div>
              )}

              {/* Toast Notification Banner */}
              {toastTip && (
                <div className="mx-3 mt-2 flex items-center justify-between gap-1.5 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-900 shadow-xs animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="truncate">{toastTip}</span>
                  </div>
                  <button
                    onClick={() => setToastTip(null)}
                    className="text-amber-600 hover:text-amber-800 cursor-pointer p-0.5 shrink-0"
                    aria-label={t('common.close')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Onboarding Banner for Hover Badge */}
              {!settings.hoverBadgePromptDismissed && (
                <div className="border-b border-zinc-200/80 bg-zinc-50/80 p-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white">
                        <Sparkles className="h-3 w-3 text-sky-400" />
                      </div>
                      <h3 className="text-xs font-semibold text-zinc-900">{t('onboarding.title')}</h3>
                    </div>
                    <button
                      onClick={() => handleHoverBadgeChoice(false)}
                      className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-0.5"
                      title={t('onboarding.closeTooltip')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    {t('onboarding.desc')}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => handleHoverBadgeChoice(true)}
                      className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors cursor-pointer shadow-2xs"
                    >
                      {t('onboarding.enableBtn')}
                    </button>
                    <button
                      onClick={() => handleHoverBadgeChoice(false)}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      {t('onboarding.dismissBtn')}
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Search Input */}
              {showSearch && (
                <div className="border-b border-zinc-100 px-4 py-2 bg-zinc-50/50">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('header.searchPlaceholder')}
                    className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                    autoFocus
                  />
                </div>
              )}

              {/* Filter Pills Bar with soft right edge indicator */}
              <div className="relative border-b border-zinc-100 bg-white">
                <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5 no-scrollbar">
                  {categories.map(([tag, count]) => {
                    const isActive = activeCategory === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setActiveCategory(tag)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-zinc-900 text-white font-semibold'
                            : 'border border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        <span>{getDisplayTagName(tag)}</span>
                        <span className={`text-[10px] ${isActive ? 'text-zinc-400' : 'text-zinc-400'}`}>
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Right edge soft gradient fade to indicate horizontal scrollability */}
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent" />
              </div>

              {/* Dual-Column Masonry Grid */}
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {showGettingStarted && (
                  <GettingStartedCard
                    hasItems={items.length > 0}
                    hasAnalyzed={hasAnalyzedItem}
                    signedIn={Boolean(accountUser)}
                    onGoGenerator={() => handleSetActiveTab('generator')}
                    onSignIn={() => setIsAccountOpen(true)}
                    onDismiss={handleDismissGettingStarted}
                  />
                )}
                {filteredItems.length === 0 ? (
                  <div className={`flex ${showGettingStarted ? 'py-6' : 'h-full'} flex-col items-center justify-center gap-3 text-center px-4`}>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                      <Folder className="h-6 w-6 text-zinc-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-700">{t('gallery.emptyTitle')}</p>
                      <p className="text-xs text-zinc-400">
                        {t('gallery.emptyDesc')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {filteredItems.map((item) => (
                      <CardItem
                        key={item.id}
                        item={item}
                        onClick={() => {
                          setSelectedItem(item);
                          setLaunchAnalysisItemId(null);
                        }}
                        onOpenLightbox={() => setLightboxItem(item)}
                        onDelete={(e) => handleDeleteItem(e, item.id)}
                        onDragStartNotify={() => setIsFolderNavOpen(true)}
                        isBatchMode={isBatchMode}
                        isSelected={selectedIds.has(item.id!)}
                        onToggleSelect={handleToggleSelect}
                        onOpenMovePopover={() => setMovingItem(item)}
                        onStartCreating={() => {
                          if (typeof item.id === 'number') {
                            openInfiniteCanvasPage({ assetId: item.id }).catch(console.warn);
                          }
                        }}
                        allSelectedIds={Array.from(selectedIds)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Batch Action Bar */}
              {isBatchMode && (
                <BatchActionBar
                  selectedCount={selectedIds.size}
                  totalCount={filteredItems.length}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onOpenBatchMove={() => setIsBatchMovePopoverOpen(true)}
                  onBatchDelete={() => setIsBatchDeleteModalOpen(true)}
                  onExit={handleExitBatchMode}
                />
              )}

              {/* Footer Status Bar */}
              <footer className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-100 px-4 text-[10px] text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span>{t('footer.syncedItems', { count: items.length })}</span>
                </div>
                <span>{t('footer.byokBadge')}</span>
              </footer>
            </>
          )}
        </>
      )}

      {/* AI Agent Collaboration Drawer */}
      <CollaborationDrawer
        isOpen={isCollaborationOpen}
        onClose={() => setIsCollaborationOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings(newSettings)}
      />


      {/* Image Lightbox Preview Modal (Double Click / Zoom) */}
      <ImageLightboxModal
        isOpen={lightboxItem !== null}
        onClose={() => setLightboxItem(null)}
        item={lightboxItem}
      />

      {/* In-App Delete Single Item Confirmation Modal */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        title={t('common.delete')}
        description={t('common.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        isDestructive={true}
        onConfirm={handleConfirmDeleteItem}
        onClose={() => setItemToDelete(null)}
      />

      {/* In-App Batch Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBatchDeleteModalOpen}
        title={t('batch.deleteConfirmTitle')}
        description={t('batch.deleteConfirmDesc', { count: selectedIds.size })}
        confirmText={t('batch.batchDelete')}
        cancelText={t('common.cancel')}
        isDestructive={true}
        onConfirm={handleConfirmBatchDelete}
        onClose={() => setIsBatchDeleteModalOpen(false)}
      />

      {/* Move Popover for Single Card */}
      {movingItem && (
        <div
          onClick={() => setMovingItem(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CardActionPopover
              currentFolderId={movingItem.folderId}
              onSelectFolder={async (targetFolderId) => {
                if (movingItem.id) {
                  await moveItemToFolder(movingItem.id, targetFolderId);
                  // 详情页持有的是打开时的快照，移动后同步归属文件夹
                  setSelectedItem((prev) => (prev && prev.id === movingItem.id ? { ...prev, folderId: targetFolderId } : prev));
                }
                setMovingItem(null);
              }}
              onClose={() => setMovingItem(null)}
            />
          </div>
        </div>
      )}

      {/* Move Popover for Batch Selection */}
      {isBatchMovePopoverOpen && (
        <div
          onClick={() => setIsBatchMovePopoverOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CardActionPopover
              title={t('batch.batchMove')}
              onSelectFolder={async (targetFolderId) => {
                if (selectedIds.size > 0) {
                  await batchMoveItemsToFolder(Array.from(selectedIds), targetFolderId);
                }
                handleExitBatchMode();
              }}
              onClose={() => setIsBatchMovePopoverOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Pro Subscription & License Redeem Modal */}
      <AccountDialog isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} user={accountUser} />

      <ProSubscriptionModal
        isOpen={isProModalOpen}
        onClose={() => setIsProModalOpen(false)}
        onActivated={async () => {
          const fresh = await getUserSettings();
          setSettings(fresh);
          showTip(t('subscription.activatedSuccess'));
        }}
      />
    </div>
  );
}

// Helper to create compact horizontal drag ghost capsule
function setCustomDragGhost(e: React.DragEvent, label: string, thumbUrl?: string) {
  const ghost = document.createElement('div');
  ghost.style.position = 'fixed';
  ghost.style.top = '-9999px';
  ghost.style.left = '-9999px';
  ghost.style.padding = thumbUrl ? '4px 10px 4px 6px' : '5px 12px';
  ghost.style.borderRadius = '9999px';
  ghost.style.background = '#18181b';
  ghost.style.color = '#ffffff';
  ghost.style.display = 'flex';
  ghost.style.alignItems = 'center';
  ghost.style.gap = '6px';
  ghost.style.boxShadow = '0 10px 25px -3px rgba(0,0,0,0.35)';
  ghost.style.fontSize = '11px';
  ghost.style.fontWeight = '600';
  ghost.style.border = '1px solid rgba(255,255,255,0.15)';
  ghost.style.zIndex = '99999';
  ghost.style.pointerEvents = 'none';

  if (thumbUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.style.width = '18px';
    img.style.height = '18px';
    img.style.borderRadius = '9999px';
    img.style.objectFit = 'cover';
    ghost.appendChild(img);
  }

  const span = document.createElement('span');
  span.textContent = label;
  span.style.maxWidth = '120px';
  span.style.overflow = 'hidden';
  span.style.textOverflow = 'ellipsis';
  span.style.whiteSpace = 'nowrap';
  ghost.appendChild(span);

  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 20, 14);
  setTimeout(() => {
    if (ghost.parentNode) document.body.removeChild(ghost);
  }, 0);
}

// Single Pocket Card Component (With HTML5 Drag & Drop Support & Compact Drag Pill & Batch Selection & Context Menu)
function CardItem({
  item,
  onClick,
  onOpenLightbox,
  onDelete,
  onDragStartNotify,
  isBatchMode,
  isSelected,
  onToggleSelect,
  onOpenMovePopover,
  onStartCreating,
  allSelectedIds,
}: {
  item: InspirationItem;
  onClick: () => void;
  onOpenLightbox?: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDragStartNotify?: () => void;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onOpenMovePopover: (e: React.MouseEvent) => void;
  onStartCreating: () => void;
  allSelectedIds: number[];
}) {
  const { t } = useI18n();
  const [thumbUrl, setThumbUrl] = useState<string>('');

  // IndexedDB 每次查询都会反序列化出新的 item/Blob 实例；仅在图片内容标识变化时重建 URL，
  // 避免任意一张卡片状态变更（如反推完成）导致整个网格缩略图闪烁重载
  const thumbBlob = item.thumbnailBlob || item.originalBlob;
  useEffect(() => {
    const url = URL.createObjectURL(thumbBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, thumbBlob.size, thumbBlob.type]);

  const handleCardClick = () => {
    if (isBatchMode) {
      onToggleSelect(item.id!);
    } else {
      onClick();
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (isBatchMode) {
      e.stopPropagation();
      onToggleSelect(item.id!);
    } else {
      onClick();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenMovePopover(e);
  };

  const isAiGenerated = isAiGeneratedItem(item);
  const isAgentCollab = isAgentCollabItem(item);

  return (
    <div
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      draggable={true}
      onDragStart={(e) => {
        if (onDragStartNotify) onDragStartNotify();

        const isMultiDrag = isSelected && allSelectedIds.length > 1;
        if (isMultiDrag) {
          e.dataTransfer.setData('text/plain', JSON.stringify(allSelectedIds));
          e.dataTransfer.effectAllowed = 'move';
          setCustomDragGhost(e, `▤ ${t('batch.dragPillText', { count: allSelectedIds.length })}`);
        } else {
          e.dataTransfer.setData('text/plain', String(item.id));
          e.dataTransfer.effectAllowed = 'move';
          setCustomDragGhost(e, (item.pageTitle || t('gallery.untitled')).slice(0, 16), thumbUrl);
        }
      }}
      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white transition-all cursor-pointer shadow-2xs hover:shadow-xs active:opacity-80 ${
        isSelected
          ? 'border-zinc-900 ring-2 ring-zinc-900/20 bg-zinc-50'
          : 'border-zinc-200 hover:border-zinc-700'
      }`}
    >
      {/* Image Thumbnail */}
      <div
        onClick={handleImageClick}
        className="relative aspect-4/3 w-full overflow-hidden bg-zinc-100"
      >
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt={item.pageTitle || t('gallery.untitled')}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        {/* Selection Checkbox (Top Left) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id!);
          }}
          className={`absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full transition-all cursor-pointer ${
            isSelected
              ? 'bg-zinc-900 text-white shadow-xs'
              : isBatchMode
              ? 'border-2 border-zinc-400 bg-white/90 hover:border-zinc-900'
              : 'hidden group-hover:flex border-2 border-zinc-400 bg-white/90 hover:border-zinc-900'
          }`}
          title={isSelected ? t('batch.deselectAll') : t('batch.enterBatch')}
        >
          {isSelected ? (
            <Check className="h-3 w-3 stroke-[3]" />
          ) : null}
        </div>

        {/* Status Badge */}
        {!isBatchMode && !isSelected && (
          <div className="absolute top-1.5 left-1.5 group-hover:hidden transition-all">
            {isAgentCollab ? (
              <span className="flex items-center gap-1 rounded-full bg-cyan-50/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-cyan-800 border border-cyan-200 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
                {t('gallery.statusAgent')}
              </span>
            ) : isAiGenerated ? (
              <span className="flex items-center gap-1 rounded-full bg-purple-50/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-purple-800 border border-purple-200 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                {t('gallery.statusGenerated')}
              </span>
            ) : item.status === 'analyzed' ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 border border-emerald-200 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                {t('gallery.statusAnalyzed')}
              </span>
            ) : item.status === 'analyzing' ? (
              <span className="flex items-center gap-1 rounded-full bg-sky-50/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-sky-800 border border-sky-200 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                {t('gallery.statusAnalyzing')}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-amber-50/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 border border-amber-200 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                {t('gallery.statusPending')}
              </span>
            )}
          </div>
        )}

        {/* Top-Right Quick Actions (Hover visible in normal mode) */}
        {!isBatchMode && (
          <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-1 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartCreating();
              }}
              className="rounded bg-white/90 backdrop-blur-xs p-1 text-violet-600 hover:text-violet-800 hover:bg-white transition-colors border border-zinc-200 shadow-2xs cursor-pointer"
              title={t('inspector.applyStyleToGen')}
            >
              <Wand2 className="h-3 w-3" />
            </button>

            {/* Move to Folder Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenMovePopover(e);
              }}
              className="rounded bg-white/90 backdrop-blur-xs p-1 text-zinc-600 hover:text-zinc-900 hover:bg-white transition-colors border border-zinc-200 shadow-2xs cursor-pointer"
              title={t('cardMenu.moveToFolder')}
            >
              <FolderInput className="h-3 w-3 text-amber-500" />
            </button>

            {/* Delete on Hover */}
            <button
              onClick={onDelete}
              className="rounded bg-white/90 backdrop-blur-xs p-1 text-zinc-400 hover:text-red-600 hover:bg-white transition-colors border border-zinc-200 shadow-2xs cursor-pointer"
              title={t('common.delete')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="p-2 space-y-1">
        <p className="truncate text-xs font-semibold text-zinc-900 leading-tight">
          {item.pageTitle || t('gallery.untitled')}
        </p>
        <div className="flex items-center justify-between text-[10px] text-zinc-400">
          <span>{formatTag(item.tags?.[0], t)}</span>
          {item.width && item.height && (
            <span className="font-mono text-[9px]">{item.width}×{item.height}</span>
          )}
        </div>
      </div>
    </div>
  );
}
