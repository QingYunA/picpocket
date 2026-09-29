import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronLeft,
  ChevronDown,
  RotateCw,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Info,
  Star,
  Wand2,
  Globe,
  Sliders,
  Maximize2,
  XCircle,
  Folder,
  Settings,
} from 'lucide-react';
import type { InspirationItem, PromptResult, UserSettings } from '@/types';
import { db } from '@/db';
import { savePromptFromAnalysis } from '@/services/promptRuntime';
import {
  analyzeImageWithAI,
  getSystemPrompt,
  assembleMasterPrompt,
} from '@/services/ai';
import { channelAccessBlock } from '@/services/billing';
import { UpgradeCreditsButton } from '@/components/UpgradeCreditsButton';
import { useAuth } from '@/hooks/useAuth';
import { saveUserSettings } from '@/utils/storage';
import { useI18n } from '@/i18n';
import { ChannelModelPicker } from './ChannelModelPicker';
import { CreditBalanceButton } from './CreditBalanceButton';
import { visionChannelMode } from '@/config/channelMode';
import { useHostedCredits } from '@/hooks/useHostedCredits';
import { formatCreditCost, isShortOnCredits, visionCreditCost } from '@/services/creditPricing';
import { currentChannelModel } from '@/config/channelSelection';
import { readFileAsDataUrl } from '@/utils/file';
import { isAiGeneratedItem, isAgentCollabItem, withAnalyzedTag } from '@/utils/itemHelpers';

interface InspectorDrawerProps {
  item: InspirationItem;
  settings: UserSettings;
  autoStartAnalysis?: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onGeneratePrompt?: (prompt: string, referenceImageDataUrl?: string) => void;
  onOpenLightbox?: () => void;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  item,
  settings,
  autoStartAnalysis = false,
  onBack,
  onOpenSettings,
  onGeneratePrompt,
  onOpenLightbox,
}) => {
  const { t } = useI18n();
  const { user: accountUser } = useAuth();

  const [imageUrl, setImageUrl] = useState<string>('');
  const [prompt, setPrompt] = useState<PromptResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当前反推渠道与模型：在图片下方的选择器里切换（含 PicPocket 官方渠道），选择即时持久化
  const accessBlock = channelAccessBlock(settings, 'vision', Boolean(accountUser));
  const canAnalyze = !accessBlock;
  const savedVisionModel = currentChannelModel(settings, 'vision').model;
  const [currentVisionModel, setCurrentVisionModel] = useState(savedVisionModel);
  // 只有官方渠道按积分计费：显示余额与预计消耗，自带 Key 的渠道不显示
  const { balance: creditBalance, pricing: creditPricing } = useHostedCredits(visionChannelMode(settings).kind === 'picpocket');
  const visionCost = creditBalance === null ? null : visionCreditCost(creditPricing, currentVisionModel);

  useEffect(() => {
    setCurrentVisionModel(savedVisionModel);
  }, [savedVisionModel]);

  // Reverse Prompt Customization State (In-situ folded editor)
  const [isPresetEditorOpen, setIsPresetEditorOpen] = useState(false);
  const [customPromptText, setCustomPromptText] = useState<string>(
    settings.customReversePrompt || getSystemPrompt(settings.language || 'zh')
  );
  const [savedPresetNotice, setSavedPresetNotice] = useState(false);
  const hasCustomPrompt = Boolean(settings.customReversePrompt?.trim());

  // Copy feedback state
  const [copiedMasterFlow, setCopiedMasterFlow] = useState(false);

  const handleResetPresetPrompt = async () => {
    const defaultPrompt = getSystemPrompt(settings.language || 'zh');
    setCustomPromptText(defaultPrompt);
    try {
      await saveUserSettings({ customReversePrompt: '' });
      setSavedPresetNotice(true);
      setTimeout(() => setSavedPresetNotice(false), 2000);
    } catch (err) {
      console.warn('Failed to reset custom prompt:', err);
    }
  };

  const handleSaveCustomPreset = async () => {
    try {
      await saveUserSettings({
        customReversePrompt: customPromptText.trim(),
      });
      setSavedPresetNotice(true);
      setTimeout(() => setSavedPresetNotice(false), 2000);
    } catch (err) {
      console.warn('Failed to save custom prompt:', err);
    }
  };

  // 前台降级反推的中断句柄，确保取消时真正终止网络请求而非仅重置 UI
  const foregroundAnalysisRef = useRef<AbortController | null>(null);

  // Load image blob as object URL（仅在图片内容标识变化时重建，避免反推状态刷新导致大图闪烁）
  const originalBlob = item.originalBlob;
  useEffect(() => {
    const url = URL.createObjectURL(originalBlob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, originalBlob.size, originalBlob.type]);

  // Query attribution folder reactively
  const currentFolder = useLiveQuery(async () => {
    if (typeof item.folderId === 'number') {
      return db.folders.get(item.folderId);
    }
    return null;
  }, [item.folderId]);

  // Load existing prompt from database and align with background status
  useEffect(() => {
    if (!item.id) return;

    db.prompts
      .where('itemId')
      .equals(item.id)
      .first()
      .then((res) => {
        if (res) {
          initPromptState(res);
          setIsAnalyzing(false);
        } else {
          // 优先核对后台是否已在运行反推任务，避免重复发起
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage(
              { action: 'CHECK_ANALYSIS_STATUS', itemId: item.id },
              (resp) => {
                if (chrome.runtime.lastError) return;
                if (resp?.isRunning) {
                  setIsAnalyzing(true);
                } else if (autoStartAnalysis && canAnalyze) {
                  runAnalysis(currentVisionModel);
                } else if (item.status === 'analyzing') {
                  // 后台并无活动任务，说明是历史非正常中断的悬挂状态，纠偏重置为 pending
                  db.items.update(item.id!, { status: 'pending' }).catch(() => {});
                  setIsAnalyzing(false);
                }
              }
            );
          } else if (autoStartAnalysis && canAnalyze) {
            runAnalysis(currentVisionModel);
          }
        }
      });
  }, [item.id, canAnalyze, autoStartAnalysis]);

  // 监听后台反推完成/失败/取消广播
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    const listener = (msg: any) => {
      if (msg.itemId !== item.id) return;

      if (msg.action === 'ANALYSIS_COMPLETED' && msg.prompt) {
        initPromptState(msg.prompt);
        setIsAnalyzing(false);
        setError(null);
      } else if (msg.action === 'ANALYSIS_FAILED') {
        setIsAnalyzing(false);
        setError(msg.error || t('inspector.analyzeFailed'));
      } else if (msg.action === 'ANALYSIS_CANCELLED') {
        setIsAnalyzing(false);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [item.id, t]);

  const initPromptState = (res: PromptResult) => {
    setPrompt(res);
  };

  const runAnalysis = async (targetModel?: string) => {
    const modelToUse = targetModel || currentVisionModel || settings.model;
    if (accessBlock) {
      setError(t(accessBlock.key, accessBlock.params));
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    // 优先委托给后台 Service Worker 执行，侧边栏收起后依然平稳完成反推
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && typeof item.id === 'number') {
      try {
        await db.items.update(item.id, { status: 'analyzing' });
        chrome.runtime.sendMessage({
          action: 'START_IMAGE_ANALYSIS',
          itemId: item.id,
          targetModel: modelToUse,
          customPrompt: customPromptText.trim(),
          startTime: Date.now(),
        });
      } catch (err: any) {
        console.warn('Failed to dispatch background analysis, falling back to foreground:', err);
        executeForegroundAnalysis(modelToUse);
      }
      return;
    }

    // 单元测试或降级模式下执行前台反推
    await executeForegroundAnalysis(modelToUse);
  };

  const executeForegroundAnalysis = async (modelToUse: string) => {
    const controller = new AbortController();
    foregroundAnalysisRef.current = controller;
    try {
      if (item.id) {
        await db.items.update(item.id, { status: 'analyzing' });
      }

      const activePrompt = customPromptText.trim() || getSystemPrompt(settings.language || 'zh');
      const result = await analyzeImageWithAI(
        item.originalBlob,
        settings,
        modelToUse,
        activePrompt,
        controller.signal
      );

      if (item.id) {
        const promptRecord: PromptResult = {
          itemId: item.id,
          model: result.model,
          subject: result.subject,
          style: result.style,
          lighting: result.lighting,
          composition: result.composition,
          masterPrompt: result.masterPrompt,
          textSlots: result.textSlots,
          templatePrompt: result.templatePrompt,
          latencyMs: result.latencyMs,
          createdAt: Date.now(),
        };

        const existing = await db.prompts.where('itemId').equals(item.id).first();
        if (existing?.id) {
          await db.prompts.put({ ...promptRecord, id: existing.id });
          promptRecord.id = existing.id;
        } else {
          const promptId = await db.prompts.add(promptRecord);
          promptRecord.id = promptId as number;
        }
        initPromptState(promptRecord);

        const latest = await db.items.get(item.id);
        await db.items.update(item.id, { status: 'analyzed', tags: withAnalyzedTag(latest?.tags) });
      }
    } catch (err: any) {
      // 用户主动取消：状态已由 handleCancelAnalysis 重置为 pending，不再标记失败
      if (controller.signal.aborted) return;
      setError(err?.message || t('inspector.analyzeFailed'));
      if (item.id) {
        await db.items.update(item.id, { status: 'failed' });
      }
    } finally {
      if (foregroundAnalysisRef.current === controller) {
        foregroundAnalysisRef.current = null;
      }
      setIsAnalyzing(false);
    }
  };

  const handleCancelAnalysis = async () => {
    if (!item.id) return;
    foregroundAnalysisRef.current?.abort();
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'CANCEL_IMAGE_ANALYSIS', itemId: item.id });
    }
    setIsAnalyzing(false);
    await db.items.update(item.id, { status: 'pending' }).catch(() => {});
  };

  const handleSaveToVault = async () => {
    if (!prompt) return;
    try {
      await savePromptFromAnalysis(item, prompt);
      setSavedToVault(true);
      setTimeout(() => setSavedToVault(false), 2500);
    } catch (err) {
      console.error('Failed to save to vault:', err);
    }
  };

  const isAiGenerated = isAiGeneratedItem(item) || Boolean(prompt?.isOriginalPrompt);
  const isAgentCollab = isAgentCollabItem(item);
  const isNativePrompt = Boolean(prompt?.isOriginalPrompt) || (isAiGenerated && (!prompt?.subject || prompt.subject.length === 0));

  // Generate natural language master prompt
  const getMasterFlowPrompt = (): string => {
    if (!prompt) return '';
    return prompt.masterPrompt || assembleMasterPrompt({ promptResult: prompt }) || item.pageTitle || '';
  };

  const copyMasterFlow = () => {
    const text = getMasterFlowPrompt();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedMasterFlow(true);
    setTimeout(() => setCopiedMasterFlow(false), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-white animate-in slide-in-from-right duration-200 select-none">
      {/* Top Navigation Bar */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-zinc-100 px-2.5 gap-1.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer shrink-0"
          title={t('inspector.galleryBack')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          {prompt && (
            <button
              onClick={copyMasterFlow}
              className="flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer shrink-0"
              title={isNativePrompt ? t('inspector.copyOriginalPrompt') : t('inspector.copyMaster')}
            >
              {copiedMasterFlow ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedMasterFlow ? t('common.copied') : t('common.copy')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5">
        {/* Image Preview Card */}
        <div
          onClick={onOpenLightbox}
          onDoubleClick={onOpenLightbox}
          className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-2xs cursor-zoom-in"
          title={t('gallery.viewLargeImage')}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt={item.pageTitle || t('gallery.untitled')}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              className="w-full max-h-52 object-contain bg-zinc-100 transition-transform duration-200 group-hover:scale-[1.01]"
            />
          )}

          {/* Dimension badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1">
            {item.width && item.height && (
              <span className="rounded bg-white/90 backdrop-blur-xs px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-800 shadow-2xs border border-zinc-200">
                {item.width} × {item.height}
              </span>
            )}
            <span className="rounded bg-white/90 backdrop-blur-xs px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-700 shadow-2xs border border-zinc-200">
              {t('inspector.originalBadge')}
            </span>
          </div>

          {/* Quick Zoom Button */}
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLightbox?.();
              }}
              className="flex items-center gap-1 rounded bg-black/60 backdrop-blur-xs px-2 py-1 text-[10px] font-semibold text-white shadow-md hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Maximize2 className="h-3 w-3 text-sky-400" />
              <span>{t('gallery.viewLargeImage')}</span>
            </button>
          </div>
        </div>

        {/* 反推操作区：渠道与模型选择 + 开始反推 */}
        <div className="space-y-1.5 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-zinc-500">{t('inspector.visionModel')}</div>
          <div className="flex items-center gap-2">
            <ChannelModelPicker
              capability="vision"
              settings={settings}
              onOpenSettings={onOpenSettings}
              onSelected={(selection) => setCurrentVisionModel(selection.model)}
              className="flex-1"
            />
            <button
              onClick={canAnalyze ? () => runAnalysis(currentVisionModel) : onOpenSettings}
              disabled={isAnalyzing}
              className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 ${
                canAnalyze && !prompt
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {canAnalyze ? (
                <RotateCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              ) : (
                <Settings className="h-3.5 w-3.5" />
              )}
              <span>
                {canAnalyze
                  ? isNativePrompt
                    ? t('inspector.deconstructWithVision')
                    : prompt
                    ? t('inspector.reanalyze')
                    : t('inspector.startAnalyze')
                  : t('inspector.configureKey')}
              </span>
            </button>
          </div>
          {creditBalance !== null && (
            <div className="flex items-center justify-end gap-2">
              {visionCost && (
                <span className="text-[10px] text-zinc-500">{t('billing.costEstimate', { cost: formatCreditCost(visionCost) })}</span>
              )}
              <CreditBalanceButton balance={creditBalance} insufficient={isShortOnCredits(creditBalance, visionCost)} />
            </div>
          )}
        </div>

        {/* Folder Attribution Banner */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] font-semibold text-zinc-600 shrink-0">{t('inspector.savedInFolder')}</span>
            <span className="truncate text-zinc-700 font-medium text-[11px]">
              {currentFolder?.name || t('webCapsule.uncategorized')}
            </span>
          </div>
        </div>

        {/* Source Web Page URL Banner */}
        {item.sourceUrl && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Globe className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="text-[11px] font-semibold text-zinc-600 shrink-0">{t('inspector.sourceOrigin')}</span>
              <span className="truncate text-zinc-500 font-mono text-[11px]" title={item.sourceUrl}>
                {item.sourceUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:bg-zinc-100 transition-colors shrink-0 shadow-2xs cursor-pointer"
              title={t('inspector.openSourcePage')}
            >
              <ExternalLink className="h-3 w-3" />
              <span>{t('inspector.sourcePage')}</span>
            </a>
          </div>
        )}

        {/* Missing API Key Alert */}
        {accessBlock && !prompt && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-600 shrink-0" />
              <span>{t(accessBlock.key, accessBlock.params)}</span>
            </div>
            <button
              onClick={onOpenSettings}
              className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer"
            >
              {t('inspector.goConfigure')}
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {error}
            <UpgradeCreditsButton message={error} className="ml-2 align-middle" />
          </div>
        )}

        {/* Loading State Skeleton */}
        {isAnalyzing && (
          <div className="space-y-3 py-6 text-center">
            <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-2 border-zinc-200 border-t-zinc-900"></div>
            <p className="text-xs text-zinc-500 font-medium">{t('inspector.analyzingProgress')}</p>
            <button
              onClick={handleCancelAnalysis}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors cursor-pointer active:scale-98"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>{t('inspector.cancelAnalysis')}</span>
            </button>
          </div>
        )}

        {/* Unanalyzed / Saved-only State Card */}
        {!prompt && !isAnalyzing && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-5 text-center my-3 animate-in fade-in duration-150">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white border border-zinc-200 text-zinc-700 shadow-2xs">
              <Sparkles className="h-4 w-4 text-sky-500" />
            </div>
            <h3 className="mt-2 text-xs font-bold text-zinc-900">{t('inspector.noPromptTitle')}</h3>
            <p className="mt-1 text-[11px] text-zinc-500 max-w-[260px] mx-auto leading-relaxed">
              {t('inspector.noPromptDesc')}
            </p>

            <button
              onClick={canAnalyze ? () => runAnalysis() : onOpenSettings}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer active:scale-98"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              <span>
                {canAnalyze
                  ? error || item.status === 'failed'
                    ? t('inspector.retryAnalyze')
                    : t('inspector.startAnalyze')
                  : t('inspector.configureKeyAndAnalyze')}
              </span>
            </button>
          </div>
        )}

        {/* Content & Style Decoupled Workbench */}
        {prompt && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Custom Reverse Prompt folded editor / Native Prompt Banner */}
            {isNativePrompt ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-purple-50/80 border border-purple-200/70 text-xs">
                <div className="flex items-center gap-1.5 text-purple-900 min-w-0">
                  <Sparkles className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span className="font-bold text-[11px] shrink-0">
                    {isAgentCollab ? t('gallery.statusAgent') : t('gallery.statusGenerated')}
                  </span>
                  <span className="text-[10px] text-purple-700/80 truncate">
                    {t('gallery.originalPromptDesc')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => runAnalysis()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer shrink-0 shadow-2xs active:scale-95 disabled:opacity-50"
                  title={t('inspector.deconstructWithVision')}
                >
                  <RotateCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span>{t('inspector.deconstructWithVision')}</span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sliders className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                    <span className="text-[11px] font-bold text-zinc-800">
                      {hasCustomPrompt ? t('inspector.customPromptRule') : t('inspector.defaultPromptRule')}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        hasCustomPrompt ? 'bg-purple-100 text-purple-700' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {hasCustomPrompt ? t('inspector.customizedBadge') : t('inspector.defaultBadge')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsPresetEditorOpen(!isPresetEditorOpen)}
                      className="text-[11px] font-medium text-sky-600 hover:text-sky-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>{isPresetEditorOpen ? t('inspector.collapseRule') : t('inspector.editRule')}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${isPresetEditorOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => runAnalysis()}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900 border border-sky-200 font-semibold cursor-pointer active:scale-95 transition-all text-[11px] disabled:opacity-50"
                      title={t('inspector.reanalyze')}
                    >
                      <RotateCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      <span>{t('inspector.reanalyze')}</span>
                    </button>
                  </div>
                </div>

                {/* Expandable in-situ prompt editor */}
                {isPresetEditorOpen && (
                  <div className="pt-2 border-t border-zinc-100 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="font-medium">{t('inspector.editPresetPrompt')}</span>
                      <button
                        type="button"
                        onClick={handleResetPresetPrompt}
                        className="text-zinc-500 hover:text-zinc-800 underline cursor-pointer"
                      >
                        {t('inspector.resetToDefaultPrompt')}
                      </button>
                    </div>
                    <textarea
                      value={customPromptText}
                      onChange={(e) => setCustomPromptText(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] font-mono text-zinc-800 focus:bg-white focus:border-zinc-900 focus:outline-none transition-all leading-relaxed resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleSaveCustomPreset}
                        className="flex-1 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold transition-colors cursor-pointer border border-zinc-200/60"
                      >
                        {savedPresetNotice ? t('inspector.customRulesSaved') : t('inspector.saveCustomPreset')}
                      </button>
                      <button
                        type="button"
                        onClick={() => runAnalysis()}
                        disabled={isAnalyzing}
                        className="flex-1 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs inline-flex items-center justify-center gap-1"
                      >
                        <RotateCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        <span>{t('inspector.reanalyze')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}



            {/* 2. Prompt Export & Generation Action Card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                  {isNativePrompt ? t('gallery.originalPromptTitle') : t('inspector.masterPromptTitle')}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {isNativePrompt ? t('gallery.originalPromptDesc') : t('inspector.synthesizedHint')}
                </span>
              </div>

              {/* Synthesized / Native Prompt Preview */}
              <p className="text-xs font-mono leading-relaxed text-zinc-800 break-words select-text bg-zinc-50/70 p-2.5 rounded-lg border border-zinc-200/60">
                {getMasterFlowPrompt() || t('inspector.synthesizedPlaceholder')}
              </p>

              {/* Copy Action */}
              <button
                type="button"
                onClick={copyMasterFlow}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 py-2 px-3 text-xs font-semibold text-zinc-800 transition-colors shadow-2xs cursor-pointer"
                title={isNativePrompt ? t('inspector.copyOriginalPrompt') : t('inspector.copyMaster')}
              >
                {copiedMasterFlow ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedMasterFlow ? t('common.copied') : (isNativePrompt ? t('inspector.copyOriginalPrompt') : t('inspector.copyMaster'))}</span>
              </button>

              {/* Key Action: Apply Style & Generate with AI */}
              {onGeneratePrompt && (
                <button
                  type="button"
                  onClick={async () => {
                    const finalPrompt = isNativePrompt
                      ? prompt.masterPrompt || item.pageTitle || ''
                      : getMasterFlowPrompt();
                    let refDataUrl: string | undefined = undefined;
                    if (item.originalBlob) {
                      try {
                        refDataUrl = await readFileAsDataUrl(item.originalBlob);
                      } catch (e) {
                        console.warn('Failed to convert originalBlob to DataURL:', e);
                      }
                    }
                    onGeneratePrompt(finalPrompt, refDataUrl);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 px-4 text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-98"
                >
                  <Wand2 className="h-4 w-4 text-amber-400" />
                  <span>{t('inspector.applyStyleToGen')}</span>
                </button>
              )}

              {/* Bottom secondary action: Save to library */}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSaveToVault}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                    savedToVault
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {savedToVault ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span>{t('inspector.savedToVault')}</span>
                    </>
                  ) : (
                    <>
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      <span>{t('inspector.saveToVault')}</span>
                    </>
                  )}
                </button>

                <span className="text-[10px] text-zinc-400">
                  {prompt.latencyMs ? t('inspector.latency', { ms: prompt.latencyMs }) : ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
