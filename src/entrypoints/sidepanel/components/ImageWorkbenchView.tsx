import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Info,
  Wand2,
  Image as ImageIcon,
  Check,
  Trash2,
  RefreshCw,
  Sliders,
  X,
  AlertCircle,
  Square,
  Maximize2,
  Minimize2,
  GripHorizontal,
  LayoutDashboard,
} from 'lucide-react';
import type {
  UserSettings,
  ImageAspectRatio,
  GeneratedImage,
  GenerationBatchTask,
  ImageGenerationParams,
  GenerationFinishedMessage,
} from '@/types';
import {
  runForegroundGenerationTask,
  ratioToDimension,
} from '@/services/imageGenerator';
import { analyzeImageWithAI } from '@/services/ai';
import { useForegroundGeneration } from '@/hooks/useForegroundGeneration';
import { useGenerationLivenessProbe } from '@/hooks/useGenerationLivenessProbe';
import {
  buildRetryRequest,
  resolveTaskReferences,
  type GenerationFormRequest,
  type ReferenceLoaders,
} from '@/utils/generationRetry';
import { channelAccessBlock } from '@/services/billing';
import { useAuth } from '@/hooks/useAuth';
import { getModelCapability } from '@/config/modelCapabilities';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  addGenerationTask,
  updateGenerationTask,
  deleteGenerationTask,
  clearGenerationTasks,
  saveGeneratedImageToGallery,
  saveGeneratedImageToPromptLibrary,
  saveReferenceAsset,
  saveReferenceAssets,
  getReferenceAsset,
  getReferenceAssets,
  dataUrlToBlob,
} from '@/db';
import {
  getUserSettings,
  saveUserSettings,
  getInitialGeneratorDraft,
  getGeneratorDraft,
  saveGeneratorDraft,
  type GeneratorDraftState,
  getActiveGeneration,
  setActiveGeneration,
  clearActiveGeneration,
} from '@/utils/storage';
import { readFileAsDataUrl } from '@/utils/file';
import { downloadBlobOrUrl } from '@/services/storageBackup';
import { openInfiniteCanvasPage } from '@/utils/navigation';
import { hostedImageSupportsEdit } from '@/config/hostedModels';
import { useHostedCatalog } from '@/hooks/useHostedCatalog';
import { formatSafeErrorMessage, readApiErrorMessage } from '@/utils/errorMessage';
import { UpgradeCreditsButton } from '@/components/UpgradeCreditsButton';
import { useI18n } from '@/i18n';
import { ChannelModelPicker } from './ChannelModelPicker';
import { CreditBalanceButton } from './CreditBalanceButton';
import { imageChannelMode } from '@/config/channelMode';
import { useHostedCredits } from '@/hooks/useHostedCredits';
import { formatCreditCost, imageCreditCost, isShortOnCredits, scaleCreditCost } from '@/services/creditPricing';
import { currentChannelModel, selectChannelModel } from '@/config/channelSelection';
import { ConfirmModal } from './ConfirmModal';
import { ReferenceImagesTray } from './workbench/ReferenceImagesTray';
import { GenerationControlsBar } from './workbench/GenerationControlsBar';
import { WorkbenchGalleryCard } from './workbench/WorkbenchGalleryCard';
import { WorkbenchPreviewModals } from './workbench/WorkbenchPreviewModals';

interface ImageWorkbenchViewProps {
  settings: UserSettings;
  initialPrompt?: string;
  initialReferenceImage?: string;
  onOpenSettings: () => void;
}

const STYLE_PRESETS = [
  { labelZh: '摄影写实', labelEn: 'Photorealistic', suffix: ', 8k photo, highly detailed, photorealistic, 35mm lens' },
  { labelZh: '二次元动漫', labelEn: 'Anime', suffix: ', anime art style, vibrant colors, clean lineart, Makoto Shinkai aesthetic' },
  { labelZh: '赛博朋克', labelEn: 'Cyberpunk', suffix: ', cyberpunk style, neon lighting, volumetric fog, dark city night' },
  { labelZh: '3D 高精渲染', labelEn: '3D Render', suffix: ', 3D hyperrealistic, Octane Render, Unreal Engine 5, smooth textures' },
  { labelZh: '电影质感', labelEn: 'Cinematic', suffix: ', cinematic lighting, anamorphic lens, dramatic atmosphere, shallow depth of field' },
];

const getErrorMessage = (err: unknown): string => {
  return readApiErrorMessage(err);
};

/** 发起生图所需的完整参数：表单参数 + 已解析的参考图 */
type GenerationStartRequest = GenerationFormRequest & {
  referenceImages: string[];
  referenceAssetIds: string[];
};

const referenceLoaders: ReferenceLoaders = {
  getMany: getReferenceAssets,
  getOne: getReferenceAsset,
};

export const ImageWorkbenchView: React.FC<ImageWorkbenchViewProps> = ({
  settings,
  initialPrompt = '',
  initialReferenceImage,
  onOpenSettings,
}) => {
  const { t, language } = useI18n();
  const { user: accountUser } = useAuth();

  // 当前生图渠道与模型（含 PicPocket 官方渠道），在「模型」一行的选择器里切换并即时持久化
  const savedImageSelection = currentChannelModel(settings, 'image');
  const [currentModel, setCurrentModel] = useState(savedImageSelection.model);
  // 只有官方渠道按积分计费：显示余额与本次消耗，自带 Key 的渠道不显示
  const { balance: creditBalance, pricing: creditPricing } = useHostedCredits(imageChannelMode(settings).kind === 'picpocket');
  const modelCapability = useMemo(() => getModelCapability(currentModel), [currentModel]);
  useHostedCatalog(); // 目录更新后重新判断模型是否支持垫图

  const initialDraft = useRef<GeneratorDraftState>(getInitialGeneratorDraft()).current;

  const [prompt, setPromptState] = useState(initialPrompt || initialDraft.prompt);
  const [aspectRatio, setAspectRatioState] = useState<ImageAspectRatio>(initialDraft.aspectRatio);
  const [count, setCountState] = useState(initialDraft.count || 1);
  // 张数在设置里可调，每张是独立请求，总消耗按张数折算
  const perImageCost = creditBalance === null ? null : imageCreditCost(creditPricing, currentModel);
  const imageCost = perImageCost && scaleCreditCost(perImageCost, count);
  const [quality, setQuality] = useState<'auto' | 'standard' | 'hd'>('auto');

  // Multi-reference images tray and deduplication pool IDs
  const [referenceImages, setReferenceImagesState] = useState<string[]>(
    initialReferenceImage
      ? [initialReferenceImage]
      : initialDraft.referenceImages && initialDraft.referenceImages.length > 0
      ? initialDraft.referenceImages
      : initialDraft.referenceImage
      ? [initialDraft.referenceImage]
      : []
  );
  const [referenceAssetIds, setReferenceAssetIdsState] = useState<string[]>(
    initialDraft.referenceAssetIds ??
      (initialDraft.referenceAssetId ? [initialDraft.referenceAssetId] : [])
  );
  const [sendAsRef, setSendAsRefState] = useState(initialDraft.sendAsRef ?? true);
  const [showAdvanced, setShowAdvancedState] = useState(initialDraft.showAdvanced ?? false);
  const [negativePrompt, setNegativePromptState] = useState(initialDraft.negativePrompt || '');

  const updateDraft = (patch: Partial<GeneratorDraftState>) => {
    saveGeneratorDraft(patch).catch(() => {});
  };

  const setPrompt = (valOrFn: string | ((prev: string) => string)) => {
    setPromptState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      updateDraft({ prompt: next });
      return next;
    });
  };

  const setAspectRatio = (ratio: ImageAspectRatio) => {
    setAspectRatioState(ratio);
    updateDraft({ aspectRatio: ratio });
  };

  const setCount = (n: number) => {
    setCountState(n);
    updateDraft({ count: n });
  };

  const referenceBlocked = imageChannelMode(settings).kind === 'picpocket' && referenceImages.length > 0 && !hostedImageSupportsEdit(currentModel);
  const setReferenceImages = async (
    imgs: string[] | ((prev: string[]) => string[]),
    knownAssetIds?: string[]
  ) => {
    const next = typeof imgs === 'function' ? imgs(referenceImages) : imgs;
    setReferenceImagesState(next);

    if (next.length > 0) {
      if (knownAssetIds && knownAssetIds.length === next.length) {
        setReferenceAssetIdsState(knownAssetIds);
        updateDraft({
          referenceImage: next[0] || null,
          referenceAssetId: knownAssetIds[0] || null,
          referenceImages: next,
          referenceAssetIds: knownAssetIds,
        });
      } else {
        try {
          const assetIds = await saveReferenceAssets(next);
          setReferenceAssetIdsState(assetIds);
          updateDraft({
            referenceImage: next[0] || null,
            referenceAssetId: assetIds[0] || null,
            referenceImages: next,
            referenceAssetIds: assetIds,
          });
        } catch {
          updateDraft({ referenceImage: next[0] || null, referenceImages: next });
        }
      }
    } else {
      setReferenceAssetIdsState([]);
      updateDraft({
        referenceImage: null,
        referenceAssetId: null,
        referenceImages: [],
        referenceAssetIds: [],
      });
    }
  };

  const setSendAsRef = (val: boolean) => {
    setSendAsRefState(val);
    updateDraft({ sendAsRef: val });
  };

  const setShowAdvanced = (val: boolean) => {
    setShowAdvancedState(val);
    updateDraft({ showAdvanced: val });
  };

  const setNegativePrompt = (val: string) => {
    setNegativePromptState(val);
    updateDraft({ negativePrompt: val });
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);
  const [elapsedSec, setElapsedSecState] = useState(0);
  const elapsedSecRef = useRef(0);
  const setElapsedSec = (valOrFn: number | ((prev: number) => number)) => {
    setElapsedSecState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      elapsedSecRef.current = next;
      return next;
    });
  };
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Live query persisted tasks from Dexie IndexedDB
  const historyTasks =
    useLiveQuery(() => db.generationTasks.orderBy('createdAt').reverse().toArray(), []) || [];

  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [previewRefUrl, setPreviewRefUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCopied = (id: string) => {
    setCopiedId(id);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
  };

  // Domain UI confirmation modals state
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);

  // Banner prompt for full-tab canvas workbench
  const [hasSeenWorkbenchWideBanner, setHasSeenWorkbenchWideBanner] = useState(true);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['hasSeenWorkbenchWideBanner']).then((res) => {
        if (!res?.hasSeenWorkbenchWideBanner) {
          setHasSeenWorkbenchWideBanner(false);
        }
      });
    }
  }, []);

  const handleDismissBanner = () => {
    setHasSeenWorkbenchWideBanner(true);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ hasSeenWorkbenchWideBanner: true }).catch(() => {});
    }
  };

  // Upgraded Prompt Editor State: Height with Memory & Zen Mode
  const [promptHeight, setPromptHeight] = useState<number>(() => {
    if (settings.workbenchPromptHeight && settings.workbenchPromptHeight >= 72) {
      return settings.workbenchPromptHeight;
    }
    const saved = localStorage.getItem('picpocket_prompt_height');
    return saved ? Math.max(72, parseInt(saved, 10)) : 88;
  });
  const [isResizingPrompt, setIsResizingPrompt] = useState(false);
  const [isZenModeOpen, setIsZenModeOpen] = useState(false);
  const [isReversingRef, setIsReversingRef] = useState(false);

  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(88);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPrompt(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = promptHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - resizeStartY.current;
      const nextHeight = Math.max(80, Math.min(320, resizeStartHeight.current + deltaY));
      setPromptHeight(nextHeight);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const deltaY = upEvent.clientY - resizeStartY.current;
      const finalHeight = Math.max(80, Math.min(320, resizeStartHeight.current + deltaY));
      setPromptHeight(finalHeight);
      try {
        localStorage.setItem('picpocket_prompt_height', String(finalHeight));
        saveUserSettings({ ...settings, workbenchPromptHeight: finalHeight });
      } catch {}
      setIsResizingPrompt(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleReverseFromReference = async (refUrl: string) => {
    const visionBlock = channelAccessBlock(settings, 'vision', Boolean(accountUser));
    if (visionBlock) {
      setErrorMsg(t(visionBlock.key, visionBlock.params));
      return;
    }
    setIsReversingRef(true);
    setErrorMsg(null);
    try {
      let blob: Blob;
      if (refUrl.startsWith('data:')) {
        blob = await dataUrlToBlob(refUrl);
      } else {
        const resp = await fetch(refUrl);
        blob = await resp.blob();
      }
      const res = await analyzeImageWithAI(blob, settings);
      if (res.masterPrompt) {
        setPrompt(res.masterPrompt);
        setFeedbackMsg(t('generator.reverseRefSuccess'));
        setTimeout(() => setFeedbackMsg(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('inspector.analyzeFailed'));
    } finally {
      setIsReversingRef(false);
    }
  };

  const timerRef = useRef<any>(null);

  // Sync settings when external changes happen
  useEffect(() => {
    setCurrentModel(savedImageSelection.model);
  }, [savedImageSelection.model]);

  // Adjust count if current model has a lower maxCount
  useEffect(() => {
    if (count > modelCapability.maxCount) {
      setCount(modelCapability.maxCount);
    }
  }, [modelCapability.maxCount, count]);

  // Update prompt / reference when initial props change
  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (initialReferenceImage) {
      if (initialReferenceImage.startsWith('blob:')) {
        fetch(initialReferenceImage)
          .then((r) => r.blob())
          .then((b) => readFileAsDataUrl(b))
          .then((dataUrl) => {
            setReferenceImages((prev) => {
              if (prev.includes(dataUrl)) return prev;
              return [dataUrl, ...prev.filter((u) => u !== initialReferenceImage)];
            });
            setSendAsRef(true);
          })
          .catch(() => {
            setReferenceImages((prev) => {
              if (prev.includes(initialReferenceImage)) return prev;
              return [initialReferenceImage, ...prev];
            });
            setSendAsRef(true);
          });
      } else {
        setReferenceImages((prev) => {
          if (prev.includes(initialReferenceImage)) return prev;
          return [initialReferenceImage, ...prev];
        });
        setSendAsRef(true);
      }
    }
  }, [initialReferenceImage]);

  // 断点续连：挂载时检测 Storage 与数据库中是否有正在运行的生图任务
  useEffect(() => {
    let isCancelled = false;

    async function recoverActiveTask() {
      try {
        const active = await getActiveGeneration();
        if (!active?.taskId || isCancelled) return;

        const elapsedSecNow = Math.max(
          0,
          Math.floor((Date.now() - (active.startTime || Date.now())) / 1000)
        );

        // 优先检查数据库中任务的真实状态
        const task = await db.generationTasks.get(active.taskId);
        if (isCancelled) return;

        if (task?.status === 'success') {
          // 侧边栏收起期间后台已顺利生成完成
          await clearActiveGeneration(active.taskId);
          setIsGenerating(false);
          setActiveTaskId(null);
          return;
        }

        if (task?.status === 'cancelled' || task?.status === 'failed') {
          // 任务已被取消或明确失败
          await clearActiveGeneration(active.taskId);
          setIsGenerating(false);
          setActiveTaskId(null);
          if (task.status === 'failed') {
            setErrorMsg(task.error || t('generator.failed'));
          }
          return;
        }

        // 若任务在有效执行时间窗口内（5分钟内），坚决保持转圈动画与秒表连续递增
        if (!task || task.status === 'generating') {
          if (elapsedSecNow < 300) {
            setActiveTaskId(active.taskId);
            setIsGenerating(true);
            setElapsedSec(elapsedSecNow);

            // 伴随性探针通知 Background：双向对齐状态，防范后台崩溃导致的虚假悬挂
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage(
                { action: 'CHECK_GENERATION_STATUS', taskId: active.taskId },
                (resp) => {
                  if (chrome.runtime?.lastError || isCancelled) return;
                  // 若 Background 明确反馈任务已不在运行，二次核对 DB 状态并纠正
                  if (resp && resp.isRunning === false) {
                    db.generationTasks
                      .get(active.taskId)
                      .then((latestTask) => {
                        if (isCancelled) return;
                        if (!latestTask || latestTask.status !== 'generating') {
                          clearActiveGeneration(active.taskId).catch(() => {});
                          setIsGenerating(false);
                          setActiveTaskId(null);
                          if (latestTask?.status === 'failed') {
                            setErrorMsg(latestTask.error || t('generator.failed'));
                          }
                        }
                      })
                      .catch(() => {});
                  }
                }
              );
            }
          } else {
            // 真实超时（超过 5 分钟），才自动纠正为失败
            await clearActiveGeneration(active.taskId);
            setIsGenerating(false);
            setActiveTaskId(null);
            await updateGenerationTask(active.taskId, {
              status: 'failed',
              error: t('generator.failed'),
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Failed to recover active generation task on mount:', err);
      }
    }

    recoverActiveTask();

    return () => {
      isCancelled = true;
    };
  }, [t]);

  // 复用后台消息监听器处理存活探针得出的结束结论
  const generationMessageHandlerRef = useRef<((msg: GenerationFinishedMessage) => void) | null>(null);

  useEffect(() => {
    if (chrome.runtime?.onMessage) {
      const messageListener = (msg: any) => {
        if (msg.action === 'IMAGE_GENERATION_FINISHED') {
          if (!msg.taskId || msg.taskId !== activeTaskIdRef.current) return;
          setIsGenerating(false);
          setActiveTaskId(null);
          if (msg.status === 'success') {
            setFeedbackMsg(t('generator.timeElapsed', { sec: elapsedSecRef.current }));
            setTimeout(() => setFeedbackMsg(null), 3000);
          } else if (msg.status === 'cancelled') {
            setFeedbackMsg(t('generator.generationAborted'));
            setTimeout(() => setFeedbackMsg(null), 2500);
          } else if (msg.status === 'failed') {
            setErrorMsg(msg.error || t('generator.failed'));
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      generationMessageHandlerRef.current = messageListener;
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
        generationMessageHandlerRef.current = null;
      };
    }
  }, [t]);

  // Asynchronously catch up with chrome.storage.local draft if present
  useEffect(() => {
    getGeneratorDraft().then((stored) => {
      if (!stored) return;
      if (!initialPrompt && stored.prompt) {
        setPromptState((curr) => curr || stored.prompt);
      }
      if (stored.count && stored.count > 1) {
        setCountState(stored.count);
      }
      if (stored.aspectRatio && stored.aspectRatio !== '1:1') {
        setAspectRatioState(stored.aspectRatio);
      }
      if (stored.negativePrompt) {
        setNegativePromptState((curr) => curr || stored.negativePrompt);
      }
      if (stored.showAdvanced) {
        setShowAdvancedState(true);
      }
      if (!initialReferenceImage) {
        if (stored.referenceAssetIds && stored.referenceAssetIds.length > 0) {
          setReferenceAssetIdsState(stored.referenceAssetIds);
          getReferenceAssets(stored.referenceAssetIds).then((imgs) => {
            if (imgs && imgs.length > 0) {
              setReferenceImagesState(imgs);
            }
          });
        } else if (stored.referenceAssetId) {
          setReferenceAssetIdsState([stored.referenceAssetId]);
          getReferenceAsset(stored.referenceAssetId).then((imgData) => {
            if (imgData) {
              setReferenceImagesState([imgData]);
            }
          });
        } else if (stored.referenceImages && stored.referenceImages.length > 0) {
          setReferenceImagesState(stored.referenceImages);
        } else if (stored.referenceImage) {
          setReferenceImagesState([stored.referenceImage]);
        }
      }
    });
  }, []);

  // Timer while generating
  useEffect(() => {
    if (isGenerating) {
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating]);

  // 复用历史任务时沿用它的模型：只在当前渠道内切换，不改变渠道
  const handleModelSelect = async (newModel: string) => {
    setCurrentModel(newModel);
    try {
      const fresh = await getUserSettings();
      const { channelId } = currentChannelModel(fresh, 'image');
      await saveUserSettings(selectChannelModel(fresh, 'image', { channelId, model: newModel }));
    } catch (err) {
      console.warn('Failed to persist imageModel to storage:', err);
    }
  };

  const handleAppendStyle = (suffix: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (trimmed.includes(suffix.trim())) return prev;
      return trimmed ? `${trimmed}${suffix}` : suffix.replace(/^,\s*/, '');
    });
  };

  // Global paste handler on the workbench container
  const handleContainerPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      const imageFiles = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        e.preventDefault();
        try {
          const dataUrls = await Promise.all(imageFiles.map((f) => readFileAsDataUrl(f)));
          setReferenceImages((prev) => [...prev, ...dataUrls]);
          setSendAsRef(true);
          setErrorMsg(null);
        } catch (err: any) {
          setErrorMsg(`${t('generator.clipboardReadFailed')}${err?.message || err}`);
        }
      }
    }
  };

  // Reorder reference images by making clicked image the primary reference (#1)
  const handleSetPrimaryReference = (index: number) => {
    if (index === 0) return;
    setReferenceImages((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const rest = prev.filter((_, i) => i !== index);
      return [target, ...rest];
    });
  };

  // Flywheel: Use result image as next reference image
  const handleUseAsReference = (image: GeneratedImage) => {
    setReferenceImages((prev) => [image.dataUrl, ...prev.filter((url) => url !== image.dataUrl)]);
    setSendAsRef(true);
    setFeedbackMsg(t('generator.referenceAdded'));
    setTimeout(() => setFeedbackMsg(null), 2000);
  };

  // 前台降级生图的中断与所有权管理（SW 不可达时才会使用）
  const foregroundGeneration = useForegroundGeneration();

  // 侧边栏常开时定期探测后台任务存活：SW 中途崩溃也能在 30 秒内收敛，而非空转到 5 分钟兜底；
  // 探针结论交给与后台广播相同的结束处理器，保证两条路径收尾一致
  useGenerationLivenessProbe(activeTaskId, isGenerating, (message) => {
    generationMessageHandlerRef.current?.(message);
  });

  const handleAbortGenerate = () => {
    if (activeTaskId) {
      clearActiveGeneration(activeTaskId).catch(() => {});
      // 前台降级执行时 SW 不可达，取消状态须在本地直接落库
      foregroundGeneration.cancel(activeTaskId, t('generator.generationAborted'));
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'CANCEL_IMAGE_GENERATION',
          taskId: activeTaskId,
        }).catch(() => {});
      }
    }
    setIsGenerating(false);
    setActiveTaskId(null);
    setFeedbackMsg(t('generator.generationAborted'));
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  const runLocalGenerateFallback = async (
    taskId: string,
    params: ImageGenerationParams,
    startTime: number
  ) => {
    const controller = foregroundGeneration.begin();
    try {
      const result = await runForegroundGenerationTask({
        taskId,
        params,
        settings,
        startTime,
        signal: controller.signal,
      });
      if (!result) return;
      setFeedbackMsg(t('generator.timeElapsed', { sec: Math.round(result.latencyMs / 1000) }));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err) || t('generator.failed'));
      await updateGenerationTask(taskId, {
        status: 'failed',
        error: getErrorMessage(err) || t('generator.failed'),
      });
    } finally {
      if (foregroundGeneration.release(controller)) {
        setIsGenerating(false);
        setActiveTaskId(null);
      }
    }
  };

  /**
   * 发起一次生图：表单「生成」与「重试失败张数」共用。
   * 参数全部来自 request 而非组件状态，避免 setState 后立即调用读到旧值。
   * syncFormReferences 仅在来自表单时为 true，用于把入池后的参考图 ID 回写表单草稿。
   */
  const startGeneration = async (request: GenerationStartRequest, syncFormReferences: boolean) => {
    const imageBlock = channelAccessBlock(settings, 'image', Boolean(accountUser));
    if (imageBlock) {
      setErrorMsg(t(imageBlock.key, imageBlock.params));
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setElapsedSec(0);

    const taskId = `task_${Date.now()}`;
    setActiveTaskId(taskId);
    const startTime = Date.now();

    // 立即持久化活跃任务状态，保障侧边栏闪退/瞬间收起时仍能断点续连
    setActiveGeneration({
      taskId,
      startTime,
      prompt: request.prompt,
    }).catch((e) => console.warn('Failed to persist active generation state:', e));

    const { referenceImages: refImages } = request;
    let finalAssetIds = request.referenceAssetIds;
    if (refImages.length > 0 && finalAssetIds.length !== refImages.length) {
      try {
        finalAssetIds = await saveReferenceAssets(refImages);
        if (syncFormReferences) setReferenceAssetIdsState(finalAssetIds);
      } catch (e) {
        console.warn('Failed to save reference assets to pool:', e);
      }
    }

    const negative = request.negativePrompt.trim() || undefined;
    const newTask: GenerationBatchTask = {
      id: taskId,
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model: request.model,
      referenceAssetId: finalAssetIds[0] || undefined,
      referenceAssetIds: finalAssetIds.length > 0 ? finalAssetIds : undefined,
      referenceImageDataUrl: finalAssetIds.length > 0 ? undefined : refImages[0] || undefined,
      generationOptions: {
        quality: request.quality,
        negativePrompt: negative,
        sendAsReferenceImage: request.sendAsReferenceImage,
      },
      images: [],
      status: 'generating',
      createdAt: startTime,
    };

    try {
      await addGenerationTask(newTask);
    } catch (e) {
      console.warn('Failed to add initial generating task to db:', e);
    }

    const genParams = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model: request.model,
      count: request.count,
      quality: request.quality,
      negativePrompt: negative,
      referenceImageDataUrl: refImages[0] || undefined,
      referenceImages: refImages,
      sendAsReferenceImage: request.sendAsReferenceImage && refImages.length > 0,
    };

    // 优先委托给 Background Service Worker 执行，确保侧边栏关闭后不会打断
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        {
          action: 'START_IMAGE_GENERATION',
          taskId,
          params: genParams,
          startTime,
        },
        (resp) => {
          if (chrome.runtime?.lastError || !resp?.success) {
            // 如果与 Background 通信失败，在本地前台执行作为兜底
            runLocalGenerateFallback(taskId, genParams, startTime);
          }
        }
      );
    } else {
      // 纯非扩展环境降级
      await runLocalGenerateFallback(taskId, genParams, startTime);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await startGeneration(
      {
        prompt,
        aspectRatio,
        model: currentModel,
        count,
        quality,
        negativePrompt,
        sendAsReferenceImage: sendAsRef,
        referenceImages,
        referenceAssetIds,
      },
      true
    );
  };

  // 局部失败任务一键重试：沿用原任务参数与参考图，仅补生成失败的张数，结果作为新任务出现在历史顶部
  // 同步守卫：isGenerating 要等进入 startGeneration 才置位，await 参考图期间的双击需由 ref 拦截
  const retryInFlightRef = useRef(false);
  const handleRetryFailed = async (task: GenerationBatchTask) => {
    if (isGenerating || retryInFlightRef.current) return;
    const request = buildRetryRequest(task);
    if (!request) return;
    retryInFlightRef.current = true;
    try {
      const refs = await resolveTaskReferences(task, referenceLoaders);
      // 参考图已被清理时中止：静默降级为少图/无图生成会与原任务不一致
      if (!refs.complete) {
        setErrorMsg(t('generator.retryMissingRefs'));
        return;
      }
      await startGeneration({ ...request, referenceImages: refs.images, referenceAssetIds: refs.assetIds }, false);
    } catch (err) {
      setErrorMsg(getErrorMessage(err) || t('generator.failed'));
    } finally {
      retryInFlightRef.current = false;
    }
  };

  const handleSaveToGallery = async (image: GeneratedImage, task: GenerationBatchTask) => {
    try {
      await saveGeneratedImageToGallery(image, task.prompt);
      const updatedImages = task.images.map((img) =>
        img.id === image.id ? { ...img, savedToGallery: true } : img
      );
      await updateGenerationTask(task.id, { images: updatedImages });
    } catch (err: any) {
      setErrorMsg(`${t('generator.saveGalleryFailed')}${getErrorMessage(err)}`);
    }
  };

  const handleSaveToPrompts = async (image: GeneratedImage, task: GenerationBatchTask) => {
    try {
      await saveGeneratedImageToPromptLibrary(image);
      const updatedImages = task.images.map((img) =>
        img.id === image.id ? { ...img, savedToPrompts: true } : img
      );
      await updateGenerationTask(task.id, { images: updatedImages });
    } catch (err: any) {
      setErrorMsg(`${t('generator.savePromptFailed')}${getErrorMessage(err)}`);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    setTaskToDelete(taskId);
  };

  const handleClearAllHistory = () => {
    setIsClearHistoryConfirmOpen(true);
  };

  const handleCopyImage = async (image: GeneratedImage) => {
    try {
      const blob = dataUrlToBlob(image.dataUrl);
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob }),
        ]);
        triggerCopied(image.id);
      } else {
        await navigator.clipboard.writeText(image.dataUrl);
        triggerCopied(image.id);
      }
    } catch {
      await navigator.clipboard.writeText(image.dataUrl);
      triggerCopied(image.id);
    }
  };

  const handleDownload = (image: GeneratedImage) => {
    downloadBlobOrUrl(image.dataUrl, `PicPocket_Gen_${Date.now()}.png`);
  };

  const handleReuseTask = async (task: GenerationBatchTask) => {
    setPrompt(task.prompt);
    setAspectRatio(task.aspectRatio);
    if (task.model) {
      handleModelSelect(task.model);
    }
    const refs = await resolveTaskReferences(task, referenceLoaders);
    if (refs.images.length > 0) {
      setReferenceImages(refs.images, refs.assetIds.length > 0 ? refs.assetIds : undefined);
      setSendAsRef(true);
    }
  };

  return (
    <div
      onPaste={handleContainerPaste}
      className="flex h-full w-full max-w-full flex-col bg-zinc-50/50 text-zinc-900 overflow-x-hidden overflow-y-auto"
    >
      <div className="px-3 py-3 space-y-3.5 max-w-lg mx-auto w-full">
        {/* 宽屏工作台首次进入引导横幅 */}
        {!hasSeenWorkbenchWideBanner && (
          <div className="relative rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 p-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0 shadow-xs">
                <Maximize2 className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium text-zinc-800 leading-relaxed">
                  {t('workbench.bannerHint')}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleDismissBanner();
                      openInfiniteCanvasPage({
                        prompt,
                        referenceImage: referenceImages[0],
                      });
                    }}
                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 transition-colors cursor-pointer shadow-2xs"
                  >
                    {t('workbench.bannerAction')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissBanner}
                    className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                  >
                    {t('workbench.bannerDismiss')}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Top Control Card */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm space-y-3">
          {/* Header and primary actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-xs shrink-0">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-zinc-900 leading-tight whitespace-nowrap">
                  {t('generator.title')}
                </h2>
                <p className="text-[10px] text-zinc-400 whitespace-nowrap">
                  {ratioToDimension(aspectRatio).size}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  openInfiniteCanvasPage({
                    prompt,
                    referenceImage: referenceImages[0],
                  })
                }
                className="flex items-center gap-1 h-7 px-2 rounded-lg bg-indigo-50 border border-indigo-200/90 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors text-[11px] font-semibold cursor-pointer shrink-0 shadow-2xs group"
                title={t('workbench.openFullscreenTooltip')}
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600 transition-transform group-hover:scale-110" />
                <span className="inline">{t('workbench.canvasTab')}</span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
                title={t('header.settings')}
              >
                <Sliders className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* The model owns a full row on narrow side-panel viewports. */}
          <div className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/70 p-1.5">
            <span className="shrink-0 pl-1 text-[10px] font-semibold text-zinc-500">
              {t('generator.modelLabel')}
            </span>
            <ChannelModelPicker
              capability="image"
              settings={settings}
              onOpenSettings={onOpenSettings}
              onSelected={(selection) => setCurrentModel(selection.model)}
              align="right"
              className="flex-1"
            />
            {creditBalance !== null && (
              <CreditBalanceButton balance={creditBalance} insufficient={isShortOnCredits(creditBalance, imageCost)} />
            )}
          </div>

          {/* Sub-component: Multi-Reference Images Tray */}
          <ReferenceImagesTray
            referenceImages={referenceImages}
            onAddImages={(urls) => {
              setReferenceImages((prev) => [...prev, ...urls]);
              setSendAsRef(true);
            }}
            onRemoveImage={(index) => {
              setReferenceImages((prev) => prev.filter((_, i) => i !== index));
            }}
            onSetPrimary={handleSetPrimaryReference}
            onClearAll={() => setReferenceImages([])}
            onPreview={(url) => setPreviewRefUrl(url)}
            sendAsRef={sendAsRef}
            onToggleSendAsRef={setSendAsRef}
            onReversePrompt={handleReverseFromReference}
            isReversingPrompt={isReversingRef}
            disabled={isGenerating}
            supportsImageToImage={modelCapability.supportsImageToImage}
            modelName={currentModel}
            onShowFeedback={(msg) => setErrorMsg(msg)}
          />

          {/* Upgraded Prompt Editor with Height Memory, Resize Handle & Zen Mode */}
          <div className="space-y-1.5">
            <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden focus-within:border-zinc-900 transition-colors">
              {/* Editor Top Mini-Bar */}
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-2.5 py-1 text-[11px]">
                <span className="font-semibold text-zinc-600">
                  {t('generator.charCount', { count: prompt.length })}
                </span>
                <div className="flex items-center gap-1.5">
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => setPrompt('')}
                      disabled={isGenerating}
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 transition-colors cursor-pointer"
                      title={t('generator.clearPrompt')}
                    >
                      <X className="h-2.5 w-2.5" />
                      <span>{t('generator.clearPrompt')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsZenModeOpen(true)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900 transition-colors cursor-pointer"
                    title={t('generator.zenMode')}
                  >
                    <Maximize2 className="h-2.5 w-2.5 text-zinc-500" />
                    <span>{t('generator.zenMode')}</span>
                  </button>
                </div>
              </div>

              {/* Textarea with dynamic height */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                disabled={isGenerating}
                placeholder={t('generator.promptPlaceholder')}
                style={{ height: `${promptHeight}px` }}
                className="w-full p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-all resize-none leading-relaxed bg-transparent"
              />

              {/* Bottom Drag Handle */}
              <div
                onMouseDown={handleResizeStart}
                className="flex items-center justify-center py-0.5 bg-zinc-50/50 hover:bg-zinc-100/90 border-t border-zinc-100 cursor-ns-resize select-none group transition-colors"
                title={t('generator.dragToResize')}
              >
                <GripHorizontal className="h-3 w-3 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
              </div>
            </div>

            {/* Quick Style Presets Tags */}
            <div className="flex flex-wrap items-center gap-1">
              {STYLE_PRESETS.map((style) => (
                <button
                  key={style.labelEn}
                  type="button"
                  onClick={() => handleAppendStyle(style.suffix)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:border-zinc-300 hover:bg-white hover:text-zinc-900 transition-all cursor-pointer shadow-2xs active:scale-95"
                >
                  + {language === 'zh' ? style.labelZh : style.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-component: Controls Bar (Aspect Ratio, Quality, Count, Advanced) */}
          <GenerationControlsBar
            aspectRatio={aspectRatio}
            onChangeAspectRatio={setAspectRatio}
            quality={quality}
            onChangeQuality={setQuality}
            count={count}
            onChangeCount={setCount}
            maxCount={modelCapability.maxCount}
            modelName={currentModel}
            showAdvanced={showAdvanced}
            onToggleShowAdvanced={() => setShowAdvanced(!showAdvanced)}
            negativePrompt={negativePrompt}
            onChangeNegativePrompt={setNegativePrompt}
            disabled={isGenerating}
          />

          {/* Feedback message */}
          {feedbackMsg && (
            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs animate-in fade-in">
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs max-h-20 overflow-y-auto break-all animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 leading-tight line-clamp-3 select-text">
                {formatSafeErrorMessage(errorMsg)}
              </div>
              <UpgradeCreditsButton message={errorMsg} />
            </div>
          )}

          {referenceBlocked && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-snug text-amber-900">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>{t('generator.referenceUnsupported', { model: currentModel })}</span>
            </div>
          )}

          {/* Main Generate & Abort Button Group */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || referenceBlocked}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white shadow-md transition-all ${
                isGenerating
                  ? 'bg-zinc-800 cursor-default'
                  : 'bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 hover:shadow-lg cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-zinc-300" />
                  <span>
                    {t('generator.generatingBtn')} ({t('generator.timeElapsed', { sec: elapsedSec })})
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>
                    {t('generator.generateBtn')}
                    {imageCost && ` · ${formatCreditCost(imageCost)} ${t('billing.creditsUnit')}`}
                  </span>
                </>
              )}
            </button>

            {isGenerating && (
              <button
                type="button"
                onClick={handleAbortGenerate}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 py-3 px-3.5 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0"
                title={t('generator.abortGeneration')}
              >
                <Square className="h-3.5 w-3.5 fill-red-600 text-red-600" />
                <span>{t('generator.abortBtn')}</span>
              </button>
            )}
          </div>

          {/* Prominent PicPocket Canvas Entry Bar */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-indigo-50/70 text-indigo-950 transition-all hover:border-indigo-200 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
                <LayoutDashboard className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-zinc-900 leading-tight truncate">
                  {t('workbench.canvasCardTitle')}
                </p>
                <p className="text-[10px] text-zinc-500 leading-tight truncate">
                  {t('workbench.canvasCardDesc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                openInfiniteCanvasPage({
                  prompt,
                  referenceImage: referenceImages[0],
                })
              }
              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-2xs hover:bg-indigo-500 transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <span>{t('workbench.canvasCardAction')}</span>
            </button>
          </div>
        </div>

        {/* Generation History Stream */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-zinc-500" />
              <span>{t('generator.historyTitle')}</span>
              {historyTasks.length > 0 && (
                <span className="text-[10px] font-mono text-zinc-400">
                  ({historyTasks.length})
                </span>
              )}
            </h3>

            {historyTasks.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="text-[10px] text-zinc-400 hover:text-red-600 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                <span>{t('generator.clearHistory')}</span>
              </button>
            )}
          </div>

          {historyTasks.length === 0 && !isGenerating && (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-8 text-center space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                <Wand2 className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-zinc-700">{t('generator.emptyTitle')}</p>
              <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                {t('generator.emptyDesc')}
              </p>
            </div>
          )}

          {/* History Cards */}
          <div className="space-y-4">
            {historyTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs space-y-2.5 animate-in fade-in"
              >
                {/* Task Header info */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-relaxed flex-1">
                    {task.prompt}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleReuseTask(task)}
                      className="text-[10px] font-medium text-zinc-400 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                      title={t('generator.reuseTitle')}
                    >
                      {t('generator.reuse')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-[10px] font-medium text-zinc-400 hover:text-red-600 bg-zinc-100 hover:bg-red-50 p-1 rounded transition-colors cursor-pointer"
                      title={t('generator.deleteTask')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span>{task.model} · {task.aspectRatio}</span>
                    {Boolean(task.referenceAssetId || task.referenceImageDataUrl) && (
                      <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-sans font-medium text-zinc-500">
                        <ImageIcon className="h-2.5 w-2.5" />
                        <span>{t('generator.hasRefImage')}</span>
                      </span>
                    )}
                  </div>
                  {task.latencyMs && <span>{Math.round(task.latencyMs / 1000)}s</span>}
                </div>

                {/* Task Content: Generating Skeleton / Cancelled / Error / Images Grid */}
                {task.status === 'generating' ? (
                  <div className="flex flex-col items-center justify-center py-7 px-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 space-y-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
                    <p className="text-xs font-medium text-zinc-600">{t('generator.statusGenerating')}</p>
                  </div>
                ) : task.status === 'cancelled' ? (
                  <div className="py-2.5 px-3 rounded-xl bg-zinc-50 border border-zinc-200 text-center text-xs text-zinc-500 font-mono">
                    {t('generator.statusCancelled')}
                  </div>
                ) : task.status === 'failed' ? (
                  <div className="py-2.5 px-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="break-words leading-tight">
                      {formatSafeErrorMessage(task.error || t('generator.failed'))}
                    </span>
                    <UpgradeCreditsButton message={task.error} />
                  </div>
                ) : (
                  <>
                  {task.partialFailure && (
                    <div className="mb-2 py-2 px-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                      <span className="flex flex-col gap-0.5 break-words leading-tight">
                        <span>
                          {t('generator.partialFailed', {
                            failed: task.partialFailure.failed,
                            requested: task.partialFailure.requested,
                          })}
                        </span>
                        {task.partialFailure.message && (
                          <span className="text-amber-600/80">
                            {formatSafeErrorMessage(task.partialFailure.message)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRetryFailed(task)}
                        disabled={isGenerating}
                        title={t('generator.retryFailedTitle')}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-300 bg-white/70 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        {t('generator.retryFailed', { failed: task.partialFailure.failed })}
                      </button>
                    </div>
                  )}
                  <div
                    className={`grid gap-2 ${
                      task.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                    }`}
                  >
                    {task.images.map((img) => (
                      <WorkbenchGalleryCard
                        key={img.id}
                        image={img}
                        task={task}
                        onPreview={(target) => setPreviewImage(target)}
                        onSaveToGallery={handleSaveToGallery}
                        onUseAsReference={handleUseAsReference}
                        onSaveToPrompts={handleSaveToPrompts}
                        onCopyImage={handleCopyImage}
                        onDownload={handleDownload}
                        isCopied={copiedId === img.id}
                      />
                    ))}
                  </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-component: Preview Modals */}
      <WorkbenchPreviewModals
        previewRefUrl={previewRefUrl}
        onCloseRefPreview={() => setPreviewRefUrl(null)}
        previewImage={previewImage}
        onCloseImagePreview={() => setPreviewImage(null)}
        onUseAsReference={handleUseAsReference}
        onCopyImage={handleCopyImage}
        onDownload={handleDownload}
      />

      {/* Task Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={taskToDelete !== null}
        title={t('generator.deleteTask')}
        description={t('generator.confirmDeleteTask')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        isDestructive={true}
        onConfirm={async () => {
          if (taskToDelete) {
            await deleteGenerationTask(taskToDelete);
            setTaskToDelete(null);
          }
        }}
        onClose={() => setTaskToDelete(null)}
      />

      {/* Clear All History Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearHistoryConfirmOpen}
        title={t('generator.clearHistory')}
        description={t('generator.confirmClearHistory')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        isDestructive={true}
        onConfirm={async () => {
          await clearGenerationTasks();
          setIsClearHistoryConfirmOpen(false);
        }}
        onClose={() => setIsClearHistoryConfirmOpen(false)}
      />

      {/* Zen Mode Prompt Editor Modal */}
      {isZenModeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsZenModeOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsZenModeOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Zen Mode Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-semibold text-zinc-900">
                  {t('generator.zenModeTitle')}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono bg-zinc-200/60 px-1.5 py-0.5 rounded-full">
                  {t('generator.charCount', { count: prompt.length })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsZenModeOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/50 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Zen Mode Body */}
            <div className="p-4 flex-1 flex flex-col gap-3 min-h-[260px] overflow-y-auto">
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    setIsZenModeOpen(false);
                    if (!isGenerating && prompt.trim()) {
                      handleGenerate();
                    }
                  }
                }}
                disabled={isGenerating}
                placeholder={t('generator.promptPlaceholder')}
                className="w-full flex-1 p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 border border-zinc-200 rounded-lg bg-zinc-50/40 focus:bg-white transition-all resize-none leading-relaxed font-sans"
              />

              {/* Quick Style Presets Tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {STYLE_PRESETS.map((style) => (
                  <button
                    key={style.labelEn}
                    type="button"
                    onClick={() => handleAppendStyle(style.suffix)}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:bg-white hover:text-zinc-900 transition-all cursor-pointer shadow-2xs active:scale-95"
                  >
                    + {language === 'zh' ? style.labelZh : style.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Zen Mode Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 bg-zinc-50/50 text-xs">
              <div className="flex items-center gap-2">
                {prompt.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPrompt('')}
                    className="text-zinc-400 hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('generator.clearPrompt')}</span>
                  </button>
                )}
                <span className="text-[11px] text-zinc-400 hidden sm:inline">
                  (⌘/Ctrl + Enter {t('generator.zenGenerateHint')})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsZenModeOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5 text-zinc-300" />
                <span>{t('generator.zenClose')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
