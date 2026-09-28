import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Settings,
  Keyboard,
  X,
  Download,
  Folder,
  Sun,
  Moon,
  Trash2,
  StickyNote,
  Maximize2,
  Wand2,
} from 'lucide-react';
import {
  calculateFitViewport,
  getGridCardPosition,
  clampScreenPosition,
  getResponsiveCardWidth,
  getViewportDimensions,
  screenToWorld,
} from './utils/viewportUtils';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  UserSettings,
  ImageAspectRatio,
  GeneratedImage,
  ImageGenerationParams,
  GenerationFinishedMessage,
  InspirationItem,
} from '@/types';
import {
  getUserSettings,
  DEFAULT_SETTINGS,
  getActiveGeneration,
  setActiveGeneration,
  clearActiveGeneration,
} from '@/utils/storage';
import {
  db,
  addGenerationTask,
  updateGenerationTask,
  saveGeneratedImageToGallery,
  saveReferenceAssets,
} from '@/db';
import {
  runForegroundGenerationTask,
  resolveImageApiConfig,
} from '@/services/imageGenerator';
import { downloadBlobOrUrl } from '@/services/storageBackup';
import { openOptionsPage } from '@/utils/navigation';
import { useForegroundGeneration } from '@/hooks/useForegroundGeneration';
import { useGenerationLivenessProbe } from '@/hooks/useGenerationLivenessProbe';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/Logo';
import { InfiniteCanvasStage } from './components/InfiniteCanvasStage';
import { CanvasToolbar } from './components/CanvasToolbar';
import { CanvasZoomControls } from './components/CanvasZoomControls';
import { CanvasContextMenu, type ContextMenuTarget } from './components/CanvasContextMenu';
import { CanvasImageCard } from './components/CanvasImageCard';
import { CanvasTextCard } from './components/CanvasTextCard';
import { PocketAssetDrawer } from './components/PocketAssetDrawer';
import { CanvasImageCropModal } from './components/CanvasImageCropModal';
import { CanvasNodeHoverToolbar } from './components/CanvasNodeHoverToolbar';
import { CanvasNodePromptPanel } from './components/CanvasNodePromptPanel';
import { CanvasImageAngleModal } from './components/CanvasImageAngleModal';
import { CanvasImageSplitModal } from './components/CanvasImageSplitModal';
import { CanvasImageUpscaleModal } from './components/CanvasImageUpscaleModal';
import { CanvasMinimap, type MinimapNode } from './components/CanvasMinimap';
import { CanvasProjectDropdown } from './components/CanvasProjectDropdown';
import { rotateDataUrl90, upscaleDataUrlToTarget, type ImageUpscaleAlgorithm } from './utils/canvasImageUtils';
import { formatSafeErrorMessage } from '@/utils/errorMessage';
import { normalizeSelectionBox, isBoxIntersecting } from './utils/canvasGeometry';
import {
  CANVAS_PROJECTS_STORAGE_KEY,
  ACTIVE_PROJECT_ID_STORAGE_KEY,
  initializeCanvasProjects,
  createCanvasProject,
  renameCanvasProject,
  deleteCanvasProject,
  updateCanvasProjectState,
} from './utils/canvasProjectStorage';
import {
  CONSOLE_HEIGHT_EXPANDED,
  CONSOLE_HEIGHT_COLLAPSED,
  DRAFT_HANDOFF_TTL_MS,
} from './types';
import { dataUrlToBlob } from '@/db';
import { analyzeImageWithAI } from '@/services/ai';
import { hasVisionAccess } from '@/services/billing';
import { useAuth } from '@/hooks/useAuth';
import { calculateSplitPiecePlacement, type SplitResultPiece } from './utils/canvasSplitUtils';
import type { CanvasImageAngleParams } from './utils/canvasAngleUtils';
import type { CanvasProject } from './types';
import type {
  ViewportTransform,
  NodePosition,
  CanvasCardItem,
  CanvasTextNote,
  TextNoteColor,
  CanvasTheme,
  CanvasToolMode,
  CanvasBackgroundMode,
  SelectionBox,
  WorkbenchHandoffDraft,
} from './types';

export const App: React.FC = () => {
  const { t, language } = useI18n();
  const { user: accountUser } = useAuth();
  // 供依赖数组为空的回调读取最新登录状态
  const accountSignedInRef = useRef(false);
  accountSignedInRef.current = Boolean(accountUser);

  // 1. 主题状态 (浅色 / 暗色双模，持久化)
  const [theme, setTheme] = useState<CanvasTheme>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_theme');
      return (saved as CanvasTheme) || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('picpocket_canvas_theme', next);
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // 2. 设置与生图参数
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_SETTINGS.imageModel || 'gpt-image-2.5-sunburst');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [count, setCount] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // 3. 画布视口状态 (默认 100% 缩放)
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 60,
    y: 80,
    k: 1.0,
  });

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // 控制台视口物理坐标 (默认左上角舒适视区，并经过严格边界钳制，绝不切边)
  const [generatorPos, setGeneratorPos] = useState<NodePosition>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_gen_pos');
      const { width: w, height: h } = getViewportDimensions();
      const savedCollapsed = localStorage.getItem('picpocket_canvas_gen_collapsed');
      const initialCollapsed = savedCollapsed !== null ? savedCollapsed === 'true' : w < 768;
      const cardW = getResponsiveCardWidth(w, initialCollapsed);
      const cardH = initialCollapsed ? CONSOLE_HEIGHT_COLLAPSED : CONSOLE_HEIGHT_EXPANDED;
      if (saved) {
        const parsed = JSON.parse(saved);
        return clampScreenPosition(parsed.x, parsed.y, w, h, cardW, cardH);
      }
      return clampScreenPosition(24, 68, w, h, cardW, cardH);
    } catch {
      return { x: 24, y: 68 };
    }
  });

  const generatorPosRef = useRef(generatorPos);
  useEffect(() => {
    generatorPosRef.current = generatorPos;
  }, [generatorPos]);

  // 双击从素材库挑选时的就地落盘坐标缓存
  const pendingInsertPositionRef = useRef<{ x: number; y: number } | null>(null);

  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_gen_collapsed');
      if (saved !== null) {
        return saved === 'true';
      }
      // 在小屏或分屏视口 (< 768px) 下默认折叠控制台，优先展示无限画布与空状态引导
      const { width: w } = getViewportDimensions();
      return w < 768;
    } catch {
      return false;
    }
  });

  // 视口窗口大小变化时，确保控制台始终自适应并钳制在可视屏幕内部
  useEffect(() => {
    const handleResize = () => {
      setGeneratorPos((prev) => {
        const { width: w, height: h } = getViewportDimensions();
        const cardW = getResponsiveCardWidth(w, isConsoleCollapsed);
        const cardH = isConsoleCollapsed ? CONSOLE_HEIGHT_COLLAPSED : CONSOLE_HEIGHT_EXPANDED;
        return clampScreenPosition(prev.x, prev.y, w, h, cardW, cardH);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isConsoleCollapsed]);

  const handleToggleConsoleCollapse = () => {
    setIsConsoleCollapsed((prev) => {
      const next = !prev;
      const { width: w, height: h } = getViewportDimensions();
      const cardW = getResponsiveCardWidth(w, next);
      const cardH = next ? CONSOLE_HEIGHT_COLLAPSED : CONSOLE_HEIGHT_EXPANDED;
      // 展开或收起时立即重新钳制物理坐标，杜绝底端展开越界被视口裁切
      setGeneratorPos((currentPos) => clampScreenPosition(currentPos.x, currentPos.y, w, h, cardW, cardH));

      // 在分屏/小屏视口 (< 768px) 下互斥：展开控制台时自动收起素材抽屉，避免遮挡堆叠
      if (!next && w < 768) {
        setIsDrawerOpen(false);
      }
      try {
        localStorage.setItem('picpocket_canvas_gen_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleGeneratorPosChange = (x: number, y: number) => {
    setGeneratorPos({ x, y });
    try {
      localStorage.setItem('picpocket_canvas_gen_pos', JSON.stringify({ x, y }));
    } catch {}
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ picpocket_canvas_gen_pos: { x, y } }).catch(() => {});
    }
  };

  // 4. 多画板项目系统 (Multi-Canvas Project Management)
  const [projects, setProjects] = useState<CanvasProject[]>(() => {
    try {
      const saved = localStorage.getItem(CANVAS_PROJECTS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // 纯净台面卡片池 (当前激活画板上的卡片集合)
  const [activeImageCards, setActiveImageCards] = useState<CanvasCardItem[]>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_active_cards');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [cardPositions, setCardPositions] = useState<Record<string, NodePosition>>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_card_positions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const cardPositionsRef = useRef(cardPositions);
  useEffect(() => {
    cardPositionsRef.current = cardPositions;
  }, [cardPositions]);

  // 双击空白处节点创建菜单状态
  const [createMenuPos, setCreateMenuPos] = useState<{
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  const selectedCardIdsRef = useRef<Set<string>>(new Set());

  // 纯函数更新卡片坐标 (支持多选成组联动平移)
  const updateCardPosition = useCallback((id: string, x: number, y: number) => {
    setCardPositions((prev) => {
      const currentPos = prev[id] || { x, y };
      const dx = x - currentPos.x;
      const dy = y - currentPos.y;

      if (dx === 0 && dy === 0) return prev;

      const currentSelectedIds = selectedCardIdsRef.current;
      if (currentSelectedIds.has(id) && currentSelectedIds.size > 1) {
        const next = { ...prev };
        currentSelectedIds.forEach((selectedId) => {
          const oldPos = prev[selectedId] || { x: 0, y: 0 };
          next[selectedId] = { x: oldPos.x + dx, y: oldPos.y + dy };
        });
        return next;
      }

      return { ...prev, [id]: { x, y } };
    });
  }, []);

  // 5. 便签节点池 (Text Notes)
  const [textNotes, setTextNotes] = useState<CanvasTextNote[]>(() => {
    try {
      const saved = localStorage.getItem('picpocket_canvas_text_notes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const isStorageHydratedRef = useRef(false);

  // 统一画板工作区应用助手函数 (Eliminate Duplicated Code)
  const applyProjectToWorkspace = useCallback((proj: CanvasProject) => {
    setActiveProjectId(proj.id);
    setActiveImageCards(proj.cards || []);
    setCardPositions(proj.cardPositions || {});
    setTextNotes(proj.textNotes || []);
    if (proj.viewport) {
      setViewport(proj.viewport);
    }
    if (proj.generatorPos) {
      const { width: w, height: h } = getViewportDimensions();
      const cardW = getResponsiveCardWidth(w, isConsoleCollapsed);
      const cardH = isConsoleCollapsed ? CONSOLE_HEIGHT_COLLAPSED : CONSOLE_HEIGHT_EXPANDED;
      setGeneratorPos(clampScreenPosition(proj.generatorPos.x, proj.generatorPos.y, w, h, cardW, cardH));
    }
    setSelectedCardId(null);
    setHoveredCardId(null);
  }, [isConsoleCollapsed]);

  // 获取当前活跃画板最新快照 (Eliminate Data Clumps)
  const getActiveProjectSnapshot = useCallback((): Partial<CanvasProject> => ({
    cards: activeImageCards.slice(0, 30),
    cardPositions,
    textNotes,
    generatorPos,
    viewport,
  }), [activeImageCards, cardPositions, textNotes, generatorPos, viewport]);

  // 挂载时尝试从 chrome.storage.local / localStorage 同步多画板与台面状态 (Storage Resilience)
  useEffect(() => {
    const keys = [
      CANVAS_PROJECTS_STORAGE_KEY,
      ACTIVE_PROJECT_ID_STORAGE_KEY,
      'picpocket_canvas_active_cards',
      'picpocket_canvas_text_notes',
      'picpocket_canvas_card_positions',
      'picpocket_canvas_gen_pos',
    ];

    const handleHydratedData = (data: Record<string, any>) => {
      const savedProjects = (data[CANVAS_PROJECTS_STORAGE_KEY] as CanvasProject[]) || null;
      const activeIdCandidate = (data[ACTIVE_PROJECT_ID_STORAGE_KEY] as string) || null;
      const legacyCards = (data.picpocket_canvas_active_cards as CanvasCardItem[]) || [];
      const legacyPositions = (data.picpocket_canvas_card_positions as Record<string, NodePosition>) || {};
      const legacyNotes = (data.picpocket_canvas_text_notes as CanvasTextNote[]) || [];
      const legacyGenPos = data.picpocket_canvas_gen_pos as NodePosition | undefined;

      const { projects: initializedProjects, activeProjectId: initializedActiveId } = initializeCanvasProjects({
        savedProjects,
        activeIdCandidate,
        legacyCards,
        legacyPositions,
        legacyNotes,
        legacyGeneratorPos: legacyGenPos,
        defaultTitle: t('workbench.defaultProjectTitle', { count: 1 }),
      });

      setProjects(initializedProjects);
      setActiveProjectId(initializedActiveId);

      const currentProj = initializedProjects.find((p) => p.id === initializedActiveId) || initializedProjects[0];
      if (currentProj) {
        applyProjectToWorkspace(currentProj);
      }

      isStorageHydratedRef.current = true;
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local
        .get(keys)
        .then((res) => {
          handleHydratedData(res);
        })
        .catch(() => {
          handleHydratedData({});
        });
    } else {
      handleHydratedData({});
    }
  }, [t, applyProjectToWorkspace]);

  // 监听当前活跃画板数据变更，纯函数更新 projects 状态
  useEffect(() => {
    if (!isStorageHydratedRef.current || !activeProjectId) return;
    setProjects((prevProjects) =>
      updateCanvasProjectState(prevProjects, activeProjectId, getActiveProjectSnapshot())
    );
  }, [activeProjectId, getActiveProjectSnapshot]);

  // 防抖持久化 projects 及当前活跃状态至 localStorage / chrome.storage.local (Storage Resilience)
  useEffect(() => {
    if (!isStorageHydratedRef.current || !activeProjectId || projects.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const serialized = JSON.stringify(projects);
        if (serialized.length < 2 * 1024 * 1024) {
          localStorage.setItem(CANVAS_PROJECTS_STORAGE_KEY, serialized);
        }
        localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, activeProjectId);
        localStorage.setItem('picpocket_canvas_card_positions', JSON.stringify(cardPositions));
        localStorage.setItem('picpocket_canvas_text_notes', JSON.stringify(textNotes));
      } catch {}

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const currentProj = projects.find((p) => p.id === activeProjectId);
        chrome.storage.local
          .set({
            [CANVAS_PROJECTS_STORAGE_KEY]: projects,
            [ACTIVE_PROJECT_ID_STORAGE_KEY]: activeProjectId,
            picpocket_canvas_active_cards: currentProj?.cards || [],
            picpocket_canvas_card_positions: cardPositions,
            picpocket_canvas_text_notes: textNotes,
          })
          .catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [projects, activeProjectId, cardPositions, textNotes]);

  // 切换画板
  const handleSelectProject = useCallback((targetId: string) => {
    if (targetId === activeProjectId) return;
    // 立即同步当前活跃画板最新脏数据
    const updated = updateCanvasProjectState(projects, activeProjectId, getActiveProjectSnapshot());
    const targetProj = updated.find((p) => p.id === targetId);
    if (targetProj) {
      setProjects(updated);
      applyProjectToWorkspace(targetProj);
      setFeedbackMsg(targetProj.title);
      setTimeout(() => setFeedbackMsg(null), 2000);
    }
  }, [activeProjectId, projects, getActiveProjectSnapshot, applyProjectToWorkspace]);

  // 新建画板
  const handleCreateProject = useCallback((customTitle?: string) => {
    // 立即同步当前活跃画板最新脏数据，杜绝防抖窗口丢失未保存内容
    const currentSynced = activeProjectId
      ? updateCanvasProjectState(projects, activeProjectId, getActiveProjectSnapshot())
      : projects;

    const defaultTitle = t('workbench.defaultProjectTitle', { count: currentSynced.length + 1 });
    const { updatedProjects, newProject } = createCanvasProject(currentSynced, customTitle?.trim() || defaultTitle);
    setProjects(updatedProjects);
    applyProjectToWorkspace(newProject);
    setFeedbackMsg(t('workbench.newProject') + ': ' + newProject.title);
    setTimeout(() => setFeedbackMsg(null), 2000);
  }, [projects, activeProjectId, getActiveProjectSnapshot, t, applyProjectToWorkspace]);

  // 重命名画板
  const handleRenameProject = useCallback((id: string, newTitle: string) => {
    const updated = renameCanvasProject(projects, id, newTitle);
    setProjects(updated);
    setFeedbackMsg(t('workbench.renameProject') + ': ' + newTitle);
    setTimeout(() => setFeedbackMsg(null), 2000);
  }, [projects, t]);

  // 删除画板
  const handleDeleteProject = useCallback((id: string) => {
    const fallbackTitle = t('workbench.defaultProjectTitle', { count: 1 });
    // 1. 若删除非当前活跃画板：当前工作区完全不发生切换，仅剔除列表项目
    if (id !== activeProjectId) {
      const { updatedProjects } = deleteCanvasProject(projects, id, fallbackTitle);
      setProjects(updatedProjects);
      return;
    }

    // 2. 若删除当前活跃画板：绝不回写当前脏数据（防止被删画板原地复活），直接切至下一个画板
    const { updatedProjects, nextActiveId } = deleteCanvasProject(projects, id, fallbackTitle);
    setProjects(updatedProjects);
    const nextProj = updatedProjects.find((p) => p.id === nextActiveId) || updatedProjects[0];
    if (nextProj) {
      applyProjectToWorkspace(nextProj);
      setFeedbackMsg(nextProj.title);
      setTimeout(() => setFeedbackMsg(null), 2000);
    }
  }, [projects, activeProjectId, t, applyProjectToWorkspace]);

  // 从双击空白处菜单创建原生生图节点 (世界层真实图元)
  const handleCreateGeneratorAt = useCallback(
    (worldX: number, worldY: number) => {
      const newCardId = `card_gen_${Date.now()}`;
      const newCard: CanvasCardItem = {
        id: newCardId,
        status: 'idle',
        prompt: '',
        model: model || 'flux-pro',
        aspectRatio: aspectRatio || '1:1',
        referenceImages: referenceImages ? [...referenceImages] : [],
        width: 320,
        height: 240,
      };

      const posX = Math.round(worldX - 160);
      const posY = Math.round(worldY - 120);

      setCardPositions((prev) => ({
        ...prev,
        [newCardId]: { x: posX, y: posY },
      }));

      setActiveImageCards((prev) => [newCard, ...prev]);
      setSelectedCardId(newCardId);
      setFeedbackMsg(t('workbench.createdGeneratorNode'));
      setTimeout(() => setFeedbackMsg(null), 2000);
    },
    [model, aspectRatio, referenceImages, t]
  );

  const handleAddTextNote = (worldX?: number, worldY?: number) => {
    const noteId = `note_${Date.now()}`;
    const defaultX =
      typeof window !== 'undefined'
        ? Math.round((window.innerWidth / 2 - viewport.x) / viewport.k) - 140
        : 500;
    const defaultY =
      typeof window !== 'undefined'
        ? Math.round((window.innerHeight / 2 - viewport.y) / viewport.k) - 80
        : 120;

    const newNote: CanvasTextNote = {
      id: noteId,
      text: '',
      x: worldX ?? defaultX,
      y: worldY ?? defaultY,
      color: 'yellow',
      createdAt: Date.now(),
    };
    setTextNotes((prev) => [...prev, newNote]);
    setSelectedCardId(noteId);
  };

  const handleUpdateTextNote = (id: string, text: string) => {
    setTextNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
  };

  const handleChangeNoteColor = (id: string, color: TextNoteColor) => {
    setTextNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
  };

  const handleDeleteTextNote = (id: string) => {
    setTextNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedCardId === id) setSelectedCardId(null);
  };

  const handleMoveTextNote = (id: string, x: number, y: number) => {
    setTextNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  // 6. 左侧素材口袋抽屉状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const totalAssetsCount = useLiveQuery(() => db.items.count(), []) ?? 0;

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    const { width: w } = getViewportDimensions();
    if (w < 768) {
      setIsConsoleCollapsed(true);
    }
  }, []);

  const handleToggleDrawer = useCallback(() => {
    setIsDrawerOpen((prev) => {
      const next = !prev;
      const { width: w } = getViewportDimensions();
      if (next && w < 768) {
        setIsConsoleCollapsed(true);
      }
      return next;
    });
  }, []);

  // 7. 生图执行态与计时
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedSecRef = useRef(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // 8. 交互高亮、多选选区与物理工具模式
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    selectedCardIdsRef.current = selectedCardIds;
  }, [selectedCardIds]);
  const selectedCardId = useMemo(() => {
    if (selectedCardIds.size === 0) return null;
    const arr = Array.from(selectedCardIds);
    return arr[arr.length - 1];
  }, [selectedCardIds]);

  const setSelectedCardId = useCallback((id: string | null) => {
    if (!id) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set([id]));
    }
  }, []);

  const handleToggleSelectCard = useCallback((id: string, multiSelect = false) => {
    setSelectedCardIds((prev) => {
      if (!multiSelect) {
        return new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectedCard = useMemo(
    () => activeImageCards.find((c) => c.id === selectedCardId),
    [activeImageCards, selectedCardId]
  );
  const selectedCardPos = useMemo(() => {
    if (!selectedCard) return null;
    return cardPositions[selectedCard.id] || getGridCardPosition(selectedCard.index || 0);
  }, [selectedCard, cardPositions]);

  const handleCanvasClick = useCallback(() => {
    setSelectedCardIds(new Set());
  }, []);

  // 画布工具模式 (选择 V / 抓手 H)
  const [tool, setTool] = useState<CanvasToolMode>('select');

  // 画布背景网格风格 (lines / dots / blank)
  const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(() => {
    try {
      return (localStorage.getItem('picpocket_canvas_bg_mode') as CanvasBackgroundMode) || 'lines';
    } catch {
      return 'lines';
    }
  });

  const handleBackgroundModeChange = (mode: CanvasBackgroundMode) => {
    setBackgroundMode(mode);
    try {
      localStorage.setItem('picpocket_canvas_bg_mode', mode);
    } catch {}
  };

  // 小地图开关
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);

  // 右键上下文菜单状态
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);

  // 矩形框选结束回调 (AABB 碰撞检测)
  const handleSelectionBoxEnd = useCallback((box: SelectionBox) => {
    const normBox = normalizeSelectionBox(box);
    const newSelectedIds = new Set<string>();

    activeImageCards.forEach((card) => {
      const pos = cardPositions[card.id] || getGridCardPosition(card.index || 0);
      const cardW = card.width || 320;
      const cardH = card.height || (card.image ? 320 : 240);
      if (
        isBoxIntersecting(normBox, {
          x: pos.x,
          y: pos.y,
          width: cardW,
          height: cardH,
        })
      ) {
        newSelectedIds.add(card.id);
      }
    });

    textNotes.forEach((note) => {
      if (
        isBoxIntersecting(normBox, {
          x: note.x,
          y: note.y,
          width: 220,
          height: 180,
        })
      ) {
        newSelectedIds.add(note.id);
      }
    });

    setSelectedCardIds(newSelectedIds);
  }, [activeImageCards, cardPositions, textNotes]);

  // 节点卡片尺寸缩放
  const handleResizeCard = useCallback((id: string, width: number, height: number, pos?: { x: number; y: number }) => {
    setActiveImageCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, width, height } : c))
    );
    if (pos) {
      setCardPositions((prev) => ({
        ...prev,
        [id]: { x: pos.x, y: pos.y },
      }));
    }
  }, []);

  // 节点卡片双击改名
  const handleRenameCard = useCallback((id: string, newTitle: string) => {
    setActiveImageCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
  }, []);

  // 批量删除所有选中的卡片与便签
  const handleDeleteSelected = useCallback(() => {
    if (selectedCardIds.size === 0) return;
    const count = selectedCardIds.size;
    setActiveImageCards((prev) => prev.filter((c) => !selectedCardIds.has(c.id)));
    setTextNotes((prev) => prev.filter((n) => !selectedCardIds.has(n.id)));
    setSelectedCardIds(new Set());
    setFeedbackMsg(`已删除 ${count} 个节点`);
    setTimeout(() => setFeedbackMsg(null), 2000);
  }, [selectedCardIds]);

  // 画布舞台右键菜单
  const handleStageContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX;
      const screenY = e.clientY;
      const worldX = Math.round((screenX - rect.left - viewport.x) / viewport.k);
      const worldY = Math.round((screenY - rect.top - viewport.y) / viewport.k);

      setContextMenuTarget({
        type: 'canvas',
        x: screenX,
        y: screenY,
        worldX,
        worldY,
      });
    },
    [viewport]
  );

  // 复制节点
  const handleDuplicateCard = useCallback((nodeId: string) => {
    const card = activeImageCards.find((c) => c.id === nodeId);
    if (!card) return;
    const newId = `card_dup_${Date.now()}`;
    const pos = cardPositions[nodeId] || { x: 500, y: 120 };
    const newCard: CanvasCardItem = {
      ...card,
      id: newId,
      title: card.title ? `${card.title} (副本)` : undefined,
    };
    setCardPositions((prev) => ({
      ...prev,
      [newId]: { x: pos.x + 36, y: pos.y + 36 },
    }));
    setActiveImageCards((prev) => [newCard, ...prev]);
    setSelectedCardId(newId);
  }, [activeImageCards, cardPositions, setSelectedCardId]);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ id: string; image: GeneratedImage } | null>(null);
  const [angleModalTarget, setAngleModalTarget] = useState<{ cardId: string; image: GeneratedImage } | null>(null);
  const [splitModalTarget, setSplitModalTarget] = useState<{ cardId: string; image: GeneratedImage } | null>(null);
  const [upscaleModalTarget, setUpscaleModalTarget] = useState<{ cardId: string; image: GeneratedImage } | null>(null);
  const activeGeneratingCardIdRef = useRef<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 9. 侧边栏草稿接力检测
  const [pendingDraft, setPendingDraft] = useState<WorkbenchHandoffDraft | null>(null);

  // 使用 ref 对当前最新参数进行解耦，杜绝用户按键输入时反复注销并重建 storage 监听通道
  const currentParamsRef = useRef({
    prompt,
    model,
    aspectRatio,
    referenceImages,
    isGenerating,
  });
  useEffect(() => {
    currentParamsRef.current = {
      prompt,
      model,
      aspectRatio,
      referenceImages,
      isGenerating,
    };
  }, [prompt, model, aspectRatio, referenceImages, isGenerating]);

  const startTimeRef = useRef<number>(0);

  // 动态同步页面标题
  useEffect(() => {
    document.title = `PicPocket - ${t('workbench.generatorTitle')}`;
  }, [t]);

  // 初始化设置
  useEffect(() => {
    getUserSettings().then((fresh) => {
      setSettings(fresh);
      if (fresh.imageChannels) setModel(fresh.imageModel || '');
      else if (fresh.imageModel) setModel(fresh.imageModel);
    });

    if (chrome.storage?.onChanged) {
      const listener = (changes: any) => {
        if (changes.promptsnap_settings) {
          getUserSettings().then((next) => {
            setSettings(next);
            if (next.imageChannels) setModel(next.imageModel || '');
            else if (next.imageModel) setModel(next.imageModel);
          });
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // 后台长任务断点重连
  useEffect(() => {
    getActiveGeneration()
      .then((active) => {
        if (active && active.taskId && Date.now() - active.startTime < DRAFT_HANDOFF_TTL_MS) {
          setIsGenerating(true);
          setActiveTaskId(active.taskId);
          startTimeRef.current = active.startTime;
          const initialSec = Math.max(0, Math.floor((Date.now() - active.startTime) / 1000));
          setElapsedSec(initialSec);
          elapsedSecRef.current = initialSec;
          if (active.prompt && !prompt) {
            setPrompt(active.prompt);
          }
        }
      })
      .catch(() => {});
  }, []);

  // 检查侧边栏草稿 (通过 ref 读取实时输入状态，避免监听通道抖动)
  const checkDraftHandoff = useCallback((incomingHandoff?: WorkbenchHandoffDraft) => {
    const evaluateHandoff = (handoff?: WorkbenchHandoffDraft) => {
      if (handoff && handoff.timestamp && Date.now() - handoff.timestamp < DRAFT_HANDOFF_TTL_MS) {
        const {
          prompt: curPrompt,
          model: curModel,
          aspectRatio: curRatio,
          referenceImages: curRefs,
          isGenerating: curGenerating,
        } = currentParamsRef.current;

        if (curGenerating) {
          setFeedbackMsg(t('workbench.generatingProtectToast'));
          setTimeout(() => setFeedbackMsg(null), 4000);
        } else {
          const hasDiff =
            (handoff.prompt && handoff.prompt !== curPrompt) ||
            (handoff.referenceImage && !curRefs.includes(handoff.referenceImage)) ||
            (handoff.aspectRatio && handoff.aspectRatio !== curRatio) ||
            (handoff.model && handoff.model !== curModel);

          if (hasDiff) {
            setPendingDraft(handoff);
          }
        }
      }
    };

    if (incomingHandoff) {
      evaluateHandoff(incomingHandoff);
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['pending_workbench_handoff']).then((res) => {
        evaluateHandoff(res.pending_workbench_handoff as WorkbenchHandoffDraft | undefined);
      });
    }
  }, [t]);

  // 草稿接力监听通道 (仅在组件挂载时建立一次，彻底与 prompt 输入解耦)
  useEffect(() => {
    checkDraftHandoff();
    const handleHashChange = () => checkDraftHandoff();
    window.addEventListener('hashchange', handleHashChange);

    let storageListener: any = null;
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      storageListener = (changes: any, areaName: string) => {
        if (areaName === 'local' && changes.pending_workbench_handoff?.newValue) {
          checkDraftHandoff(changes.pending_workbench_handoff.newValue as WorkbenchHandoffDraft);
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (storageListener && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(storageListener);
      }
    };
  }, [checkDraftHandoff]);

  const applyPendingDraft = () => {
    if (!pendingDraft) return;
    if (pendingDraft.prompt) setPrompt(pendingDraft.prompt);
    if (pendingDraft.model) setModel(pendingDraft.model);
    if (pendingDraft.aspectRatio) setAspectRatio(pendingDraft.aspectRatio);
    if (pendingDraft.referenceImage) {
      setReferenceImages([pendingDraft.referenceImage]);
    }
    setPendingDraft(null);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove(['pending_workbench_handoff']).catch(() => {});
    }
  };

  const dismissPendingDraft = () => {
    setPendingDraft(null);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove(['pending_workbench_handoff']).catch(() => {});
    }
  };

  // 批量添加图片卡片到画布台面 (原子化批量更新，支持分屏自适应单列排布，彻底消除异步闭包叠死与视口溢出)
  const addImagesToCanvas = useCallback(
    (images: GeneratedImage[], preferredStartPos?: NodePosition) => {
      if (images.length === 0) return;

      const { width: screenW, height: screenH } = getViewportDimensions();
      const isNarrow = screenW < 768;
      // 窄屏/分屏下自适应单列 (cols = 1)，宽屏下自适应最多 3 列
      const cols = isNarrow ? 1 : Math.min(3, Math.max(1, Math.floor((screenW - 160) / 350)));

      const fallbackWorldX = Math.round((screenW / 2 - viewportRef.current.x) / viewportRef.current.k) - 160;
      const fallbackWorldY = Math.round((screenH / 2 - viewportRef.current.y) / viewportRef.current.k) - 190;

      const baseX = preferredStartPos ? preferredStartPos.x : fallbackWorldX;
      const baseY = preferredStartPos ? preferredStartPos.y : fallbackWorldY;

      const newCards: CanvasCardItem[] = [];
      const newPositions: Record<string, NodePosition> = {};

      images.forEach((img, idx) => {
        const cardId = img.id || `card_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        const overallIndex = activeImageCards.length + idx;
        const cardPos: NodePosition = preferredStartPos
          ? {
              x: baseX + (idx % cols) * 350,
              y: baseY + Math.floor(idx / cols) * 420,
            }
          : {
              x: baseX + (overallIndex % cols) * 350,
              y: baseY + Math.floor(overallIndex / cols) * 420,
            };

        newCards.push({
          id: cardId,
          image: img,
          taskId: `task_${Date.now()}`,
          index: overallIndex,
        });
        newPositions[cardId] = cardPos;
      });

      setCardPositions((prev) => ({ ...prev, ...newPositions }));
      setActiveImageCards((prev) => [...newCards, ...prev]);
      if (newCards.length > 0 && newCards[0]) {
        setSelectedCardId(newCards[0].id);
      }
    },
    [activeImageCards.length]
  );

  // 单张卡片代理方法
  const addImageToCanvas = useCallback(
    (img: GeneratedImage, preferredPos?: NodePosition) => {
      addImagesToCanvas([img], preferredPos);
    },
    [addImagesToCanvas]
  );

  // 解耦高频变动坐标与函数引用，严格遵守 AGENTS.md 长连接与 IPC 监听状态解耦守则
  const addImagesToCanvasRef = useRef(addImagesToCanvas);
  useEffect(() => {
    addImagesToCanvasRef.current = addImagesToCanvas;
  }, [addImagesToCanvas]);

  // 计算在当前控制舱右侧或下方的世界坐标排布起点
  const getSpawnPositionNearGenerator = useCallback((): NodePosition => {
    const { width: screenW } = getViewportDimensions();
    const isNarrow = screenW < 768;
    const currentGenPos = generatorPosRef.current || { x: 24, y: 68 };
    const spawnScreenX = isNarrow ? currentGenPos.x : currentGenPos.x + 440;
    const spawnScreenY = isNarrow ? currentGenPos.y + CONSOLE_HEIGHT_EXPANDED + 20 : currentGenPos.y;
    return screenToWorld(spawnScreenX, spawnScreenY, viewportRef.current);
  }, []);

  // 复用后台消息监听器处理存活探针得出的结束结论，避免复制成图落位等收尾逻辑
  const generationMessageHandlerRef = useRef<((msg: GenerationFinishedMessage) => void) | null>(null);

  // 工作台常开时定期探测后台任务存活：SW 中途崩溃也能在 30 秒内收敛，而非空转到 5 分钟兜底
  useGenerationLivenessProbe(activeTaskId, isGenerating, (message) => {
    generationMessageHandlerRef.current?.(message);
  });

  // 监听后台生图完成消息 (仅依赖静态 t，杜绝 60Hz 拖拽导致监听通道反复注销重建)
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (msg: any) => {
        if (msg.action === 'IMAGE_GENERATION_FINISHED') {
          if (!msg.taskId || msg.taskId !== activeTaskIdRef.current) return;
          setIsGenerating(false);
          setActiveTaskId(null);
          const targetCardId = activeGeneratingCardIdRef.current;
          activeGeneratingCardIdRef.current = null;

          if (msg.status === 'success') {
            setFeedbackMsg(t('generator.timeElapsed', { sec: elapsedSecRef.current }));
            setTimeout(() => setFeedbackMsg(null), 3000);

            // 自动将新生成的图片批量放到当前台面
            if (msg.taskId) {
              db.generationTasks
                .get(msg.taskId)
                .then((task) => {
                  if (task && task.images && task.images.length > 0) {
                    if (targetCardId) {
                      // 原地更新该原生生图节点为成图态
                      const primaryImg = task.images[0];
                      if (!primaryImg) return;
                      setActiveImageCards((prev) =>
                        prev.map((c) => {
                          if (c.id !== targetCardId) return c;
                          return {
                            ...c,
                            status: 'success',
                            image: primaryImg,
                            prompt: primaryImg.prompt || c.prompt,
                            model: primaryImg.model || c.model,
                            aspectRatio: primaryImg.aspectRatio || c.aspectRatio,
                            error: undefined,
                          };
                        })
                      );

                      // 若生成多张，将其余卡片排布在当前节点右侧
                      if (task.images.length > 1) {
                        const currentPos = cardPositionsRef.current[targetCardId] || { x: 80, y: 100 };
                        const extraCards = task.images.slice(1).map((img, idx) => {
                          const extraId = `card_${Date.now()}_${idx}`;
                          return {
                            card: {
                              id: extraId,
                              image: img,
                              taskId: msg.taskId,
                              index: activeImageCards.length + idx + 1,
                              status: 'success' as const,
                            },
                            pos: {
                              x: currentPos.x + (idx + 1) * 350,
                              y: currentPos.y,
                            },
                          };
                        });
                        setActiveImageCards((prev) => [...prev, ...extraCards.map((e) => e.card)]);
                        setCardPositions((prev) => {
                          const next = { ...prev };
                          extraCards.forEach((e) => {
                            next[e.card.id] = e.pos;
                          });
                          return next;
                        });
                      }
                    } else {
                      const spawnWorldPos = getSpawnPositionNearGenerator();
                      addImagesToCanvasRef.current(task.images, spawnWorldPos);
                    }
                  }
                })
                .catch(() => {});
            }
          } else if (msg.status === 'cancelled') {
            setFeedbackMsg(t('generator.generationAborted'));
            setTimeout(() => setFeedbackMsg(null), 2500);
            if (targetCardId) {
              setActiveImageCards((prev) =>
                prev.map((c) => {
                  if (c.id !== targetCardId) return c;
                  return {
                    ...c,
                    status: c.image ? 'success' : 'idle',
                  };
                })
              );
            }
          } else if (msg.status === 'failed') {
            const cleanErr = formatSafeErrorMessage(msg.error || t('workbench.generationFailed'));
            setErrorMsg(cleanErr);
            if (targetCardId) {
              setActiveImageCards((prev) =>
                prev.map((c) => {
                  if (c.id !== targetCardId) return c;
                  return {
                    ...c,
                    status: 'error',
                    error: cleanErr,
                  };
                })
              );
            }
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
  }, [t, getSpawnPositionNearGenerator, activeImageCards.length]);

  // 计时器 (同步推进节点卡片的耗时感知)
  useEffect(() => {
    let timer: any = null;
    if (isGenerating) {
      const updateSec = () => {
        const start = startTimeRef.current || Date.now();
        const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
        setElapsedSec(sec);
        elapsedSecRef.current = sec;
        const targetId = activeGeneratingCardIdRef.current;
        if (targetId) {
          setActiveImageCards((prev) =>
            prev.map((c) => (c.id === targetId ? { ...c, elapsedSec: sec } : c))
          );
        }
      };
      updateSec();
      timer = setInterval(updateSec, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isGenerating]);

  // 前台降级生图的中断与所有权管理（SW 不可达时才会使用；同一时刻仅允许一个生成任务）
  const foregroundGeneration = useForegroundGeneration();

  // 本地降级生成 (全局悬浮控制舱触发)
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
      const { images: generated, latencyMs } = result;
      setFeedbackMsg(t('generator.timeElapsed', { sec: Math.round(latencyMs / 1000) }));
      setTimeout(() => setFeedbackMsg(null), 3000);

      // 追加到画布台面 (批量原子添加并基于控制舱就地排布)
      const spawnWorldPos = getSpawnPositionNearGenerator();
      addImagesToCanvas(generated, spawnWorldPos);
    } catch (err: any) {
      const msg = formatSafeErrorMessage(err?.message || String(err));
      setErrorMsg(msg);
      await updateGenerationTask(taskId, { status: 'failed', error: msg });
    } finally {
      if (foregroundGeneration.release(controller)) {
        setIsGenerating(false);
        setActiveTaskId(null);
      }
    }
  };

  // 本地降级生成 (单个原生生图节点触发)
  const runLocalGenerateNodeFallback = async (
    cardId: string,
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
      const { images: generated, latencyMs } = result;
      setFeedbackMsg(t('generator.timeElapsed', { sec: Math.round(latencyMs / 1000) }));
      setTimeout(() => setFeedbackMsg(null), 3000);

      if (generated.length > 0) {
        const primaryImg = generated[0];
        if (!primaryImg) return;
        setActiveImageCards((prev) =>
          prev.map((c) => {
            if (c.id !== cardId) return c;
            return {
              ...c,
              status: 'success',
              image: primaryImg,
              prompt: primaryImg.prompt || c.prompt,
              model: primaryImg.model || c.model,
              aspectRatio: primaryImg.aspectRatio || c.aspectRatio,
              error: undefined,
            };
          })
        );

        if (generated.length > 1) {
          const currentPos = cardPositionsRef.current[cardId] || { x: 80, y: 100 };
          const extraCards = generated.slice(1).map((img, idx) => {
            const extraId = `card_${Date.now()}_${idx}`;
            return {
              card: {
                id: extraId,
                image: img,
                taskId,
                index: activeImageCards.length + idx + 1,
                status: 'success' as const,
              },
              pos: {
                x: currentPos.x + (idx + 1) * 350,
                y: currentPos.y,
              },
            };
          });
          setActiveImageCards((prev) => [...prev, ...extraCards.map((e) => e.card)]);
          setCardPositions((prev) => {
            const next = { ...prev };
            extraCards.forEach((e) => {
              next[e.card.id] = e.pos;
            });
            return next;
          });
        }
      }
    } catch (err: any) {
      const msg = formatSafeErrorMessage(err?.message || String(err));
      setErrorMsg(msg);
      setActiveImageCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          return {
            ...c,
            status: 'error',
            error: msg,
          };
        })
      );
      await updateGenerationTask(taskId, { status: 'failed', error: msg });
    } finally {
      if (foregroundGeneration.release(controller)) {
        setIsGenerating(false);
        setActiveTaskId(null);
        activeGeneratingCardIdRef.current = null;
      }
    }
  };

  // 单个节点就地触发生图 (原生生图节点闭环)
  const handleGenerateNode = useCallback(
    async (params: {
      cardId: string;
      prompt: string;
      model: string;
      aspectRatio: ImageAspectRatio;
      referenceImages: string[];
    }) => {
      const { cardId, prompt: nodePrompt, model: nodeModel, aspectRatio: nodeRatio, referenceImages: nodeRefs } = params;
      if (!nodePrompt.trim()) return;
      if (isGenerating) {
        setFeedbackMsg(t('workbench.taskInProgressNotice'));
        setTimeout(() => setFeedbackMsg(null), 2500);
        return;
      }

      const apiConfig = resolveImageApiConfig(settings, undefined, accountSignedInRef.current);
      if (!apiConfig.isProManaged && !apiConfig.apiKey) {
        setErrorMsg(t('generator.noApiKeyHint'));
        return;
      }

      setErrorMsg(null);
      setIsGenerating(true);
      setElapsedSec(0);
      elapsedSecRef.current = 0;
      activeGeneratingCardIdRef.current = cardId;

      const taskId = `task_${Date.now()}`;
      setActiveTaskId(taskId);
      const startTime = Date.now();
      startTimeRef.current = startTime;

      setActiveGeneration({ taskId, startTime, prompt: nodePrompt }).catch(() => {});

      // 原地将该节点转为 loading 状态
      setActiveImageCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          return {
            ...c,
            status: 'loading',
            taskId,
            prompt: nodePrompt,
            model: nodeModel,
            aspectRatio: nodeRatio,
            referenceImages: nodeRefs,
            error: undefined,
            elapsedSec: 0,
          };
        })
      );

      let finalAssetIds: string[] = [];
      if (nodeRefs.length > 0) {
        try {
          finalAssetIds = await saveReferenceAssets(nodeRefs);
        } catch (e) {
          console.warn('Failed to save ref assets:', e);
        }
      }

      const genParams: ImageGenerationParams = {
        prompt: nodePrompt,
        model: nodeModel,
        aspectRatio: nodeRatio,
        count: 1,
        referenceImages: nodeRefs,
        sendAsReferenceImage: nodeRefs.length > 0,
        transparent,
      };

      await addGenerationTask({
        id: taskId,
        prompt: nodePrompt,
        model: nodeModel,
        aspectRatio: nodeRatio,
        status: 'generating',
        createdAt: startTime,
        images: [],
        referenceAssetIds: finalAssetIds,
      });

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: 'START_IMAGE_GENERATION',
            taskId,
            params: genParams,
            settings,
            startTime,
          })
          .catch(() => {
            runLocalGenerateNodeFallback(cardId, taskId, genParams, startTime);
          });
      } else {
        runLocalGenerateNodeFallback(cardId, taskId, genParams, startTime);
      }
    },
    [isGenerating, settings, transparent, t]
  );

  const handleNodePromptChange = useCallback((cardId: string, newPrompt: string) => {
    setActiveImageCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, prompt: newPrompt } : c))
    );
  }, []);

  const handleNodeConfigChange = useCallback((cardId: string, patch: any) => {
    setActiveImageCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c))
    );
  }, []);

  const handleRetryNode = useCallback(
    (cardId: string) => {
      const target = activeImageCards.find((c) => c.id === cardId);
      if (target && target.prompt) {
        handleGenerateNode({
          cardId: target.id,
          prompt: target.prompt,
          model: target.model || model || 'flux-pro',
          aspectRatio: target.aspectRatio || aspectRatio || '1:1',
          referenceImages: target.referenceImages || [],
        });
      }
    },
    [activeImageCards, handleGenerateNode, model, aspectRatio]
  );

  const handleStopNode = useCallback(
    (_cardId: string) => {
      handleAbort();
    },
    []
  );

  // 触发生成 (支持直接传入指定 prompt 与参考图快速生图)
  const handleGenerate = async (customPrompt?: string, customRefs?: string[]) => {
    const activePrompt = (customPrompt !== undefined ? customPrompt : prompt).trim();
    const activeRefs = customRefs !== undefined ? customRefs : referenceImages;

    if (!activePrompt || isGenerating) return;

    const apiConfig = resolveImageApiConfig(settings, undefined, Boolean(accountUser));
    if (!apiConfig.isProManaged && !apiConfig.apiKey) {
      setErrorMsg(t('generator.noApiKeyHint'));
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setElapsedSec(0);
    elapsedSecRef.current = 0;

    const taskId = `task_${Date.now()}`;
    setActiveTaskId(taskId);
    const startTime = Date.now();
    startTimeRef.current = startTime;

    setActiveGeneration({ taskId, startTime, prompt: activePrompt }).catch(() => {});

    let finalAssetIds: string[] = [];
    if (activeRefs.length > 0) {
      try {
        finalAssetIds = await saveReferenceAssets(activeRefs);
      } catch (e) {
        console.warn('Failed to save ref assets:', e);
      }
    }

    const params: ImageGenerationParams = {
      prompt: activePrompt,
      model,
      aspectRatio,
      count,
      referenceImages: activeRefs,
      sendAsReferenceImage: activeRefs.length > 0,
      transparent,
    };

    await addGenerationTask({
      id: taskId,
      prompt,
      model,
      aspectRatio,
      status: 'generating',
      createdAt: startTime,
      images: [],
      referenceAssetIds: finalAssetIds,
    });

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          action: 'START_IMAGE_GENERATION',
          taskId,
          params,
          settings,
          startTime,
        })
        .catch(() => {
          runLocalGenerateFallback(taskId, params, startTime);
        });
    } else {
      runLocalGenerateFallback(taskId, params, startTime);
    }
  };

  const handleAbort = () => {
    if (activeTaskId) {
      clearActiveGeneration(activeTaskId).catch(() => {});
      // 前台降级执行时 SW 不可达，取消状态须在本地直接落库
      foregroundGeneration.cancel(activeTaskId, t('generator.generationAborted'));
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: 'CANCEL_IMAGE_GENERATION',
            taskId: activeTaskId,
          })
          .catch(() => {});
      }
    }
    const generatingCardId = activeGeneratingCardIdRef.current;
    if (generatingCardId) {
      setActiveImageCards((prev) =>
        prev.map((c) => {
          if (c.id !== generatingCardId) return c;
          return {
            ...c,
            status: c.image ? 'success' : 'idle',
            error: undefined,
          };
        })
      );
      activeGeneratingCardIdRef.current = null;
    }
    setIsGenerating(false);
    setActiveTaskId(null);
  };

  const folders = useLiveQuery(() => db.folders.toArray(), []) || [];

  // 保存图片到图库
  const handleSaveToGallery = async (image: GeneratedImage) => {
    try {
      await saveGeneratedImageToGallery(image);
      setActiveImageCards((prev) =>
        prev.map((c) =>
          c.image && c.image.dataUrl === image.dataUrl
            ? { ...c, image: { ...c.image, savedToGallery: true } }
            : c
        )
      );
      setFeedbackMsg(t('workbench.savedToGallery'));
      setTimeout(() => setFeedbackMsg(null), 2000);
    } catch (e) {
      console.warn('Failed to save to gallery:', e);
    }
  };

  // 保存图片到指定文件夹
  const handleSaveToFolder = async (image: GeneratedImage, folderId?: number | null) => {
    try {
      await saveGeneratedImageToGallery(image, undefined, folderId);
      setActiveImageCards((prev) =>
        prev.map((c) =>
          c.image && c.image.dataUrl === image.dataUrl
            ? { ...c, image: { ...c.image, savedToGallery: true } }
            : c
        )
      );
      setFeedbackMsg(t('workbench.saveToFolderSuccess'));
      setTimeout(() => setFeedbackMsg(null), 2000);
    } catch (e) {
      console.warn('Failed to save to folder:', e);
    }
  };

  // 设为参考图
  const handleSetAsReference = (image: GeneratedImage) => {
    setReferenceImages((prev) => [image.dataUrl, ...prev.filter((u) => u !== image.dataUrl)]);
    setIsConsoleCollapsed(false);
    setFeedbackMsg(t('workbench.referenceSetNotice'));
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // 下载原图
  const handleDownload = (image: GeneratedImage) => {
    const filename = `picpocket_${image.id || Date.now()}_${image.aspectRatio.replace(':', 'x')}.png`;
    downloadBlobOrUrl(image.dataUrl, filename);
  };

  // 从台面剔除单张卡片（底层数据库只增不减）
  const handleDeleteCard = (cardId: string) => {
    setActiveImageCards((prev) => prev.filter((c) => c.id !== cardId));
    if (selectedCardId === cardId) {
      setSelectedCardId(null);
    }
  };

  // 清空台面（只清空当前画纸台面，底层数据库零损失）
  const handleConfirmClearStage = () => {
    setActiveImageCards([]);
    setTextNotes([]);
    setSelectedCardId(null);
    setShowClearConfirm(false);
    setFeedbackMsg(t('workbench.clearStageSuccess'));
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // 从抽屉添加素材到画布
  const handleAddDrawerItemToCanvas = (dataUrl: string, item: InspirationItem) => {
    const genImg: GeneratedImage = {
      id: item.id ? `item_${item.id}` : `card_${Date.now()}`,
      dataUrl,
      aspectRatio: '1:1',
      prompt: item.pageTitle || '',
      width: item.width || 1024,
      height: item.height || 1024,
      createdAt: item.createdAt || Date.now(),
      savedToGallery: true,
    };
    const preferredPos = pendingInsertPositionRef.current || undefined;
    pendingInsertPositionRef.current = null;
    addImageToCanvas(genImg, preferredPos);
  };

  // 处理舞台外部拖入图片
  const handleDropStageImage = (imageDataUrlOrItem: string, worldX: number, worldY: number) => {
    try {
      if (imageDataUrlOrItem.startsWith('{')) {
        const parsed = JSON.parse(imageDataUrlOrItem);
        const genImg: GeneratedImage = {
          id: parsed.id || `drop_${Date.now()}`,
          dataUrl: parsed.url,
          aspectRatio: '1:1',
          prompt: parsed.prompt || '',
          width: parsed.width || 1024,
          height: parsed.height || 1024,
          createdAt: Date.now(),
          savedToGallery: true,
        };
        addImageToCanvas(genImg, { x: worldX, y: worldY });
        return;
      }
    } catch {}

    const genImg: GeneratedImage = {
      id: `drop_${Date.now()}`,
      dataUrl: imageDataUrlOrItem,
      aspectRatio: '1:1',
      prompt: '',
      width: 1024,
      height: 1024,
      createdAt: Date.now(),
      savedToGallery: false,
    };
    addImageToCanvas(genImg, { x: worldX, y: worldY });
  };

  // 图片二次编辑：顺时针旋转 90°
  const handleRotateCard = async (cardId: string, img: GeneratedImage) => {
    try {
      const nextDataUrl = await rotateDataUrl90(img.dataUrl);
      setActiveImageCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          const currentImg = c.image || img;
          return {
            ...c,
            image: {
              ...currentImg,
              id: `${currentImg.id}_rot_${Date.now()}`,
              savedToGallery: false,
              dataUrl: nextDataUrl,
              width: img.height || 1024,
              height: img.width || 1024,
            },
          };
        })
      );
    } catch (e) {
      console.warn('Failed to rotate:', e);
    }
  };

  // 图片安全高清放大：唤起目标分辨率与算法选择模态框
  const handleUpscaleCard = (cardId: string, img: GeneratedImage) => {
    setUpscaleModalTarget({ cardId, image: img });
  };

  // 确认执行目标档位放大 (100% 钳制在 4096px 以内，根除暴增)
  const handleConfirmUpscale = async (
    targetLongEdge: number,
    algorithm: ImageUpscaleAlgorithm
  ) => {
    if (!upscaleModalTarget) return;
    const { cardId, image: img } = upscaleModalTarget;
    setFeedbackMsg(t('workbench.upscaling'));
    try {
      const result = await upscaleDataUrlToTarget(img.dataUrl, targetLongEdge, algorithm);
      setActiveImageCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          const curImg = c.image || img;
          return {
            ...c,
            image: {
              ...curImg,
              id: `${curImg.id}_up_${Date.now()}`,
              savedToGallery: false,
              dataUrl: result.dataUrl,
              width: result.width,
              height: result.height,
            },
          };
        })
      );
      setFeedbackMsg(t('common.saved'));
      setTimeout(() => setFeedbackMsg(null), 2000);
    } catch (e) {
      console.warn('Failed to upscale:', e);
      setFeedbackMsg(null);
    } finally {
      setUpscaleModalTarget(null);
    }
  };

  // 裁切模态框确认
  const handleConfirmCrop = (croppedDataUrl: string, cropWidth: number, cropHeight: number) => {
    if (!cropTarget) return;
    const { id } = cropTarget;
    setActiveImageCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const curImg = c.image || cropTarget.image;
        return {
          ...c,
          image: {
            ...curImg,
            id: `${curImg.id}_crop_${Date.now()}`,
            savedToGallery: false,
            dataUrl: croppedDataUrl,
            width: Math.round(cropWidth),
            height: Math.round(cropHeight),
          },
        };
      })
    );
    setCropTarget(null);
  };

  // 复制提示词
  const handleCopyPrompt = (promptText: string) => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setFeedbackMsg(t('common.copied'));
    setTimeout(() => setFeedbackMsg(null), 2000);
  };

  // 视觉反推提示词
  const handleReversePrompt = async (img: GeneratedImage) => {
    if (!hasVisionAccess(settings, Boolean(accountUser))) {
      setErrorMsg(t('inspector.requireApiKey'));
      return;
    }
    setFeedbackMsg(t('workbench.reversePrompt') + '...');
    try {
      const blob = await dataUrlToBlob(img.dataUrl);
      const res = await analyzeImageWithAI(blob, settings);
      if (res.masterPrompt) {
        setPrompt(res.masterPrompt);
        setIsConsoleCollapsed(false);
        setFeedbackMsg(t('generator.reverseRefSuccess'));
        setTimeout(() => setFeedbackMsg(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('inspector.analyzeFailed'));
    }
  };

  // 相机视角转换模态框确认 (自动组装视角提示词与参考图，并立即触发 AI 生图)
  const handleConfirmAngle = (
    img: GeneratedImage,
    _params: CanvasImageAngleParams,
    anglePrompt: string
  ) => {
    setAngleModalTarget(null);
    const newRefs = [img.dataUrl];
    setReferenceImages(newRefs);
    setPrompt(anglePrompt);
    setIsConsoleCollapsed(false);
    setFeedbackMsg(t('workbench.cameraAngle') + '：' + t('workbench.generateBtn'));
    handleGenerate(anglePrompt, newRefs);
  };

  // 九宫格切图模态框确认
  const handleConfirmSplit = (
    sourceImage: GeneratedImage,
    pieces: SplitResultPiece[]
  ) => {
    setSplitModalTarget(null);
    if (!pieces.length) return;

    // 精准根据 sourceImage.id 定位源卡片在画布中的世界坐标（支持 Hover 触发与未拖拽网格初始坐标）
    const sourceCard = activeImageCards.find(
      (c) => (c.image && c.image.id === sourceImage.id) || c.id === sourceImage.id
    );
    const sourcePos = sourceCard
      ? cardPositions[sourceCard.id] || getGridCardPosition(sourceCard.index || 0)
      : selectedCardId && cardPositions[selectedCardId]
      ? cardPositions[selectedCardId]
      : { x: 500, y: 120 };

    pieces.forEach((p, idx) => {
      const pieceCard: GeneratedImage = {
        id: `split_${Date.now()}_${idx}`,
        dataUrl: p.dataUrl,
        aspectRatio: '1:1',
        prompt: sourceImage.prompt,
        width: p.width,
        height: p.height,
        createdAt: Date.now(),
        savedToGallery: false,
      };
      const targetPos = calculateSplitPiecePlacement(sourcePos, p.row, p.column);
      addImageToCanvas(pieceCard, targetPos);
    });

    setFeedbackMsg(t('workbench.totalPieces', { count: pieces.length }));
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // 快捷键总线 (P 抽屉, T 便签, Cmd+Enter, Cmd+0, Delete, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof Element && e.target.closest("[contenteditable='true']"));

      // V / H: 工具切换 (选择 / 抓手)
      if ((e.key === 'v' || e.key === 'V') && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTool('select');
        return;
      }
      if ((e.key === 'h' || e.key === 'H') && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTool('pan');
        return;
      }

      // P: 切换素材抽屉 (联动折叠控制台)
      if ((e.key === 'p' || e.key === 'P') && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleToggleDrawer();
        return;
      }

      // T: 新建便签
      if ((e.key === 't' || e.key === 'T') && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAddTextNote();
        return;
      }

      // Cmd/Ctrl + Enter: 全局生图 (非输入框焦点时若折叠则自动展开)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isInput) {
        e.preventDefault();
        setIsConsoleCollapsed(false);
        if (!isGenerating && prompt.trim()) {
          handleGenerate();
        }
        return;
      }

      // Cmd/Ctrl + 0: 自适应画板居中
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        handleFitView();
        return;
      }

      // Delete: 删除选中图片或便签 (多选支持)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedCardIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
          return;
        }
      }

      // Esc: 关闭大图或取消选中
      if (e.key === 'Escape') {
        if (contextMenuTarget) {
          setContextMenuTarget(null);
        } else if (cropTarget) {
          setCropTarget(null);
        } else if (angleModalTarget) {
          setAngleModalTarget(null);
        } else if (splitModalTarget) {
          setSplitModalTarget(null);
        } else if (showClearConfirm) {
          setShowClearConfirm(false);
        } else if (lightboxImage) {
          setLightboxImage(null);
        } else if (selectedCardIds.size > 0) {
          setSelectedCardIds(new Set());
        } else if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
        } else if (isDrawerOpen) {
          setIsDrawerOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCardId,
    selectedCardIds,
    handleDeleteSelected,
    contextMenuTarget,
    lightboxImage,
    showShortcutsHelp,
    isGenerating,
    prompt,
    cropTarget,
    showClearConfirm,
    isDrawerOpen,
    activeImageCards,
    cardPositions,
    textNotes,
  ]);


  // 视口自适应居中算法 (智能聚焦所有卡片包围盒)
  const handleFitView = useCallback(() => {
    const items: { x: number; y: number; width: number; height: number }[] = [];
    activeImageCards.forEach((c) => {
      const pos = cardPositions[c.id] || getGridCardPosition(c.index || 0);
      items.push({
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 380,
      });
    });
    textNotes.forEach((n) => {
      items.push({
        x: n.x,
        y: n.y,
        width: 280,
        height: 180,
      });
    });

    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    const fit = calculateFitViewport(items, w, h, 100);
    setViewport(fit);
  }, [activeImageCards, cardPositions, textNotes]);

  // 缩放操作
  const handleZoom = (factor: number) => {
    setViewport((prev) => ({
      ...prev,
      k: Math.min(Math.max(Number((prev.k * factor).toFixed(2)), 0.2), 3.0),
    }));
  };

  // 重置缩放到 100% 原始视口
  const handleResetZoom = () => {
    setViewport((prev) => ({ ...prev, k: 1.0 }));
  };

  // 示例灵感提示词库（符合好好说话规范，中英双语自适应）
  const samplePromptsZh = [
    '极简静物摄影，磨砂亚克力立方体与米白色陶器，清晨柔和侧光，柔焦背景，高端杂志社论风格',
    '赛博朋克雨夜街道，霓虹灯倒影在潮湿的沥青路面上，全息广告牌与远景摩天大楼，电影感宽幅构图，35mm 镜头景深',
    '日系清新胶片风插画，晴朗海边电车站台，微风吹拂的蓝色窗帘，治愈系阳光，细腻笔触与颗粒质感',
    '未来主义机械腕表解构图，悬浮零件爆炸图，高精度工业渲染，钛合金与蓝宝石镜面质感，摄影棚布光',
  ];
  const samplePromptsEn = [
    'Minimalist still life photography, frosted acrylic cube and off-white ceramics, soft morning side light, soft focus backdrop, editorial magazine style',
    'Cyberpunk rainy night street, neon reflections on wet asphalt, holographic billboards and distant skyscrapers, cinematic wide composition, 35mm depth of field',
    'Japanese anime aesthetic film illustration, sunny coastal train station, gentle sea breeze swaying blue curtains, warm healing sunlight, soft grain texture',
    'Futuristic mechanical watch exploded view, floating deconstructed components, high-precision industrial rendering, titanium and sapphire crystal texture',
  ];

  const handleTrySamplePrompt = useCallback(() => {
    const isChinese = language === 'zh';
    const list = isChinese ? samplePromptsZh : samplePromptsEn;
    const randomIndex = Math.floor(Math.random() * list.length);
    setPrompt(list[randomIndex] || list[0] || '');
    setIsConsoleCollapsed(false);
    setFeedbackMsg(t('workbench.trySamplePrompt'));
    setTimeout(() => setFeedbackMsg(null), 2000);
  }, [language, t]);

  // 鼠标悬停卡片与工具栏交互（支持鼠标滑过卡片或选中卡片唤起悬浮工具栏）
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const hoverLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardMouseEnter = useCallback((cardId: string) => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setHoveredCardId(cardId);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
    }
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredCardId(null);
    }, 250);
  }, []);

  const handleToolbarMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const handleToolbarMouseLeave = useCallback(() => {
    handleCardMouseLeave();
  }, [handleCardMouseLeave]);

  // 当前工具栏激活对应的图片卡片（优先鼠标悬停目标，兜底当前选中目标）
  const activeToolbarCardId = hoveredCardId || selectedCardId;
  const activeToolbarCard = activeToolbarCardId
    ? activeImageCards.find((c) => c.id === activeToolbarCardId)
    : null;
  const activeToolbarCardPos = activeToolbarCard
    ? cardPositions[activeToolbarCard.id] || getGridCardPosition(activeToolbarCard.index || 0)
    : null;

  // 组装小地图节点池
  const minimapNodes: MinimapNode[] = [
    ...activeImageCards.map((c) => {
      const pos = cardPositions[c.id] || getGridCardPosition(c.index || 0);
      return {
        id: c.id,
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 380,
        type: 'image' as const,
      };
    }),
    ...textNotes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: 280,
      height: 180,
      type: 'text' as const,
    })),
  ];

  const isLight = theme === 'light';

  return (
    <div
      className={`relative w-full h-full overflow-hidden font-sans select-none flex flex-col transition-colors ${
        isLight ? 'bg-[#F8FAFC] text-slate-900' : 'bg-zinc-950 text-zinc-100'
      }`}
    >
      {/* 1. 顶部悬浮控制栏 (Glass Topbar，全响应式抗挤压自适应) */}
      <header className="absolute top-3.5 left-3 right-3 sm:left-4 sm:right-4 z-40 flex items-center justify-between pointer-events-none gap-2">
        {/* 左侧：Logo、素材抽屉按钮与台面计数 */}
        <div
          className={`flex shrink-0 items-center gap-1.5 sm:gap-2 backdrop-blur-xl border px-2.5 sm:px-3 py-1.5 rounded-2xl shadow-xl pointer-events-auto transition-colors ${
            isLight
              ? 'bg-white/90 border-slate-200 text-slate-800'
              : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-100'
          }`}
        >
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Logo size={28} />
            <span className="font-semibold text-xs sm:text-sm tracking-tight shrink-0 whitespace-nowrap">
              PicPocket
            </span>
            <span className="opacity-25 shrink-0">/</span>
            <CanvasProjectDropdown
              projects={projects}
              activeProjectId={activeProjectId}
              theme={theme}
              onSelectProject={handleSelectProject}
              onCreateProject={() => handleCreateProject()}
              onRenameProject={handleRenameProject}
              onDeleteProject={handleDeleteProject}
            />
          </div>

          <div className="h-4 w-px bg-current opacity-15 mx-0.5 shrink-0" />

          {/* 素材抽屉开关按钮 */}
          <button
            onClick={handleToggleDrawer}
            className={`flex shrink-0 items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              isDrawerOpen
                ? 'bg-violet-600 text-white shadow-xs'
                : isLight
                ? 'hover:bg-slate-100 text-slate-700'
                : 'hover:bg-zinc-800 text-zinc-300'
            }`}
            title={t('workbench.pocketDrawerTooltip')}
          >
            <Folder className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="hidden sm:inline shrink-0 whitespace-nowrap">{t('workbench.pocketDrawer')}</span>
            <span className="text-[11px] opacity-60 shrink-0">({totalAssetsCount})</span>
          </button>

          {/* 便签创建按钮 */}
          <button
            onClick={() => handleAddTextNote()}
            className={`flex shrink-0 items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-zinc-800 text-zinc-300'
            }`}
            title={t('workbench.addTextNoteTooltip')}
          >
            <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="hidden sm:inline shrink-0 whitespace-nowrap">{t('workbench.addTextNote')}</span>
          </button>

          <div className="h-4 w-px bg-current opacity-15 mx-0.5 shrink-0" />

          {/* 清空台面按钮 */}
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={activeImageCards.length === 0 && textNotes.length === 0}
            className={`flex shrink-0 items-center gap-1 px-1.5 sm:px-2 py-1 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
              isLight
                ? 'hover:bg-red-50 text-slate-500 hover:text-red-600'
                : 'hover:bg-red-950/40 text-zinc-400 hover:text-red-400'
            }`}
            title={t('workbench.clearStage')}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline shrink-0 whitespace-nowrap">{t('workbench.clearStage')}</span>
          </button>
        </div>

        {/* 右侧：主题切换、缩放、快捷键与设置 */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* 明暗双模主题切换 */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 sm:p-2 rounded-2xl border transition-colors shadow-xl cursor-pointer shrink-0 ${
              isLight
                ? 'bg-white/90 border-slate-200 text-amber-600 hover:bg-slate-100'
                : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
            title={isLight ? t('workbench.themeDark') : t('workbench.themeLight')}
          >
            {isLight ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 视口缩放控制与自适应 */}
          <div
            className={`flex shrink-0 items-center gap-0.5 sm:gap-1 backdrop-blur-xl border p-1 rounded-2xl shadow-xl ${
              isLight ? 'bg-white/90 border-slate-200' : 'bg-zinc-900/90 border-zinc-800/80'
            }`}
          >
            <button
              onClick={() => handleZoom(0.85)}
              className={`hidden sm:inline-flex p-1 sm:p-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              title={t('workbench.zoomOut')}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className={`px-1.5 sm:px-2 py-1 rounded-xl text-[11px] font-mono font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
              title={t('workbench.resetZoom')}
            >
              {Math.round(viewport.k * 100)}%
            </button>
            <button
              onClick={() => handleZoom(1.15)}
              className={`hidden sm:inline-flex p-1 sm:p-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              title={t('workbench.zoomIn')}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFitView}
              className={`p-1 sm:p-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              title={`${t('workbench.fitView')} (Cmd+0)`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className={`hidden sm:inline-flex p-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              title={t('workbench.resetZoom')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 快捷键帮助 */}
          <div className="relative">
            <button
              onClick={() => setShowShortcutsHelp((prev) => !prev)}
              className={`p-1.5 sm:p-2 rounded-2xl border transition-colors shadow-xl cursor-pointer shrink-0 ${
                showShortcutsHelp
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : isLight
                  ? 'bg-white/90 border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400 hover:text-white'
              }`}
              title={t('workbench.shortcutsTitle')}
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {showShortcutsHelp && (
              <div
                className={`absolute right-0 mt-2 w-64 p-3 rounded-2xl border shadow-2xl backdrop-blur-xl text-xs space-y-2 z-50 animate-in fade-in zoom-in-95 ${
                  isLight
                    ? 'bg-white/95 border-slate-200 text-slate-800'
                    : 'bg-zinc-900/95 border-zinc-800 text-zinc-100'
                }`}
              >
                <div className="font-semibold pb-1 border-b border-inherit flex items-center justify-between">
                  <span>{t('workbench.shortcutsTitle')}</span>
                  <button
                    onClick={() => setShowShortcutsHelp(false)}
                    className="opacity-50 hover:opacity-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 opacity-80">
                  <div>{t('workbench.shortcutSpace')}</div>
                  <div>{t('workbench.shortcutWheel')}</div>
                  <div>{t('workbench.shortcutDrawer')}</div>
                  <div>{t('workbench.shortcutNote')}</div>
                  <div>{t('workbench.shortcutGenerate')}</div>
                  <div>{t('workbench.shortcutReset')}</div>
                  <div>{t('workbench.shortcutDelete')}</div>
                  <div>{t('workbench.shortcutEsc')}</div>
                </div>
              </div>
            )}
          </div>

          {/* 设置直达 */}
          <button
            onClick={() => openOptionsPage({ route: '/models/image' })}
            className={`p-1.5 sm:p-2 rounded-2xl border backdrop-blur-xl shadow-xl transition-colors cursor-pointer shrink-0 ${
              isLight
                ? 'bg-white/90 border-slate-200 text-slate-600 hover:bg-slate-100'
                : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400 hover:text-white'
            }`}
            title={t('workbench.openSettings')}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. 侧边栏草稿接力提醒浮层 (Screen HUD: 独立悬浮通知胶囊，自适应响应式排列，绝不横向溢出) */}
      {pendingDraft && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-[calc(100vw-24px)] animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 backdrop-blur-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-2xl border ${
              isLight
                ? 'bg-violet-50/95 border-violet-200 text-violet-950 shadow-violet-200/50'
                : 'bg-zinc-900/95 border-violet-700/60 text-zinc-100 shadow-black/80'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <div className="flex shrink-0 items-center justify-center w-6 h-6 rounded-lg bg-violet-600/15 text-violet-600 dark:text-violet-400">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-medium break-words whitespace-normal leading-relaxed">
                {t('workbench.draftDiffNotice')}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
              <button
                onClick={applyPendingDraft}
                className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-xs font-medium text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap shadow-xs"
              >
                {t('workbench.loadLatestDraft')}
              </button>
              <button
                onClick={dismissPendingDraft}
                className={`px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  isLight
                    ? 'hover:bg-violet-100 text-violet-700'
                    : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('workbench.dismissDraft')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 左侧素材抽屉 (Pocket Asset Drawer) */}
      <PocketAssetDrawer
        isOpen={isDrawerOpen}
        theme={theme}
        onClose={() => setIsDrawerOpen(false)}
        onAddImageToCanvas={handleAddDrawerItemToCanvas}
        onSetAsReference={(url) => {
          setReferenceImages((prev) => [url, ...prev.filter((u) => u !== url)]);
          setFeedbackMsg(t('workbench.setAsRefSuccess'));
          setTimeout(() => setFeedbackMsg(null), 2500);
        }}
      />

      {/* 3. 无限画布主舞台 (Infinite Canvas Stage) */}
      <div className="flex-1 w-full h-full relative">
        <InfiniteCanvasStage
          theme={theme}
          viewport={viewport}
          tool={tool}
          backgroundMode={backgroundMode}
          onViewportChange={setViewport}
          onCanvasClick={handleCanvasClick}
          onContextMenu={handleStageContextMenu}
          onSelectionBoxEnd={handleSelectionBoxEnd}
          onDoubleClickStage={(wx, wy) => {
            handleCreateGeneratorAt(wx, wy);
          }}
          onDropImage={handleDropStageImage}
        >
          {/* (1) 渲染 Text 灵感便签卡片 (世界层) */}
          {textNotes.map((note) => (
            <CanvasTextCard
              key={note.id}
              note={note}
              theme={theme}
              scale={viewport.k}
              isSelected={selectedCardIds.has(note.id)}
              onSelect={() => handleToggleSelectCard(note.id, false)}
              onChangeText={handleUpdateTextNote}
              onChangeColor={handleChangeNoteColor}
              onDelete={handleDeleteTextNote}
              onMove={handleMoveTextNote}
            />
          ))}

          {/* (2) 渲染活跃台面图片卡片 (世界层) */}
          {activeImageCards.map((item) => {
            const pos = cardPositions[item.id] || getGridCardPosition(item.index || 0);
            const isCardSelected = selectedCardIds.has(item.id);
            const cardW = item.width || 320;
            const cardH = item.height || (item.image ? 320 : 240);

            return (
              <CanvasImageCard
                key={item.id}
                id={item.id}
                title={item.title}
                width={cardW}
                height={cardH}
                image={item.image}
                status={item.status}
                prompt={item.prompt}
                model={item.model}
                aspectRatio={item.aspectRatio}
                referenceImages={item.referenceImages}
                error={item.error}
                elapsedSec={item.elapsedSec}
                theme={theme}
                folders={folders}
                x={pos.x}
                y={pos.y}
                scale={viewport.k}
                isSelected={isCardSelected}
                isPanMode={tool === 'pan'}
                onSelect={(multi) => handleToggleSelectCard(item.id, multi ?? false)}
                onResize={(id, w, h, newPos) => handleResizeCard(id, w, h, newPos)}
                onTitleChange={(id, newTitle) => handleRenameCard(id, newTitle)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedCardId(item.id);
                  setContextMenuTarget({
                    type: 'node',
                    nodeId: item.id,
                    x: e.clientX,
                    y: e.clientY,
                    worldX: pos.x,
                    worldY: pos.y,
                  });
                }}
                onMouseEnter={() => handleCardMouseEnter(item.id)}
                onMouseLeave={handleCardMouseLeave}
                onPositionChange={(nx, ny) => updateCardPosition(item.id, nx, ny)}
                onViewOriginal={(img) => setLightboxImage(img)}
                onSaveToGallery={handleSaveToGallery}
                onSaveToFolder={handleSaveToFolder}
                onSetAsReference={handleSetAsReference}
                onCrop={() => item.image && setCropTarget({ id: item.id, image: item.image })}
                onRotate={() => item.image && handleRotateCard(item.id, item.image)}
                onUpscale={() => item.image && handleUpscaleCard(item.id, item.image)}
                onDownload={handleDownload}
                onDelete={handleDeleteCard}
                onRetry={handleRetryNode}
                renderPromptPanel={() => (
                  <CanvasNodePromptPanel
                    cardId={item.id}
                    initialPrompt={item.prompt || ''}
                    initialModel={item.model || model}
                    initialAspectRatio={item.aspectRatio || aspectRatio}
                    initialReferenceImages={item.referenceImages || []}
                    isGenerating={isGenerating && activeGeneratingCardIdRef.current === item.id}
                    hasExistingImage={item.status === 'success' && Boolean(item.image)}
                    theme={theme}
                    onGenerate={handleGenerateNode}
                    onStop={handleStopNode}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleNodeConfigChange}
                  />
                )}
              />
            );
          })}
        </InfiniteCanvasStage>

        {/* (3) 节点悬浮工具栏 (Hover Toolbar: 仅在成图状态下激活) */}
        {activeToolbarCard && activeToolbarCard.image && activeToolbarCardPos && (
          <CanvasNodeHoverToolbar
            cardId={activeToolbarCard.id}
            image={activeToolbarCard.image}
            cardX={activeToolbarCardPos.x}
            cardY={activeToolbarCardPos.y}
            cardWidth={320}
            viewport={viewport}
            theme={theme}
            onMouseEnter={handleToolbarMouseEnter}
            onMouseLeave={handleToolbarMouseLeave}
            onCopyPrompt={handleCopyPrompt}
            onReversePrompt={handleReversePrompt}
            onRotate={handleRotateCard}
            onUpscale={handleUpscaleCard}
            onAngle={(cardId, img) => setAngleModalTarget({ cardId, image: img })}
            onSplit={(cardId, img) => setSplitModalTarget({ cardId, image: img })}
            onCrop={() => setCropTarget({ id: activeToolbarCard.id, image: activeToolbarCard.image! })}
            onSetAsReference={handleSetAsReference}
            onSaveToGallery={handleSaveToGallery}
            onDownload={handleDownload}
            onViewOriginal={(img) => setLightboxImage(img)}
            onDelete={handleDeleteCard}
          />
        )}

        {/* (4) Minimap 鹰眼小地图 */}
        {isMiniMapOpen && (
          <CanvasMinimap
            nodes={minimapNodes}
            viewport={viewport}
            theme={theme}
            viewportSize={viewportSize}
            onViewportChange={setViewport}
          />
        )}

        {/* (5) 底部居中 Dock 工具栏 (Screen HUD) */}
        <CanvasToolbar
          canvasTool={tool}
          theme={theme}
          backgroundMode={backgroundMode}
          selectedCount={selectedCardIds.size}
          onCanvasToolChange={setTool}
          onThemeChange={setTheme}
          onBackgroundModeChange={handleBackgroundModeChange}
          onAddImage={() => {
            const centerX = Math.round((window.innerWidth / 2 - viewport.x) / viewport.k);
            const centerY = Math.round((window.innerHeight / 2 - viewport.y) / viewport.k);
            handleCreateGeneratorAt(centerX, centerY);
          }}
          onAddNote={() => handleAddTextNote()}
          onUpload={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const centerX = Math.round((window.innerWidth / 2 - viewport.x) / viewport.k);
                const centerY = Math.round((window.innerHeight / 2 - viewport.y) / viewport.k);
                const dataUrl = await readFileAsDataUrl(file);
                const img: GeneratedImage = {
                  id: `upload_${Date.now()}`,
                  dataUrl,
                  aspectRatio: '1:1',
                  prompt: file.name,
                  width: 1024,
                  height: 1024,
                  createdAt: Date.now(),
                  savedToGallery: true,
                };
                addImageToCanvas(img, { x: centerX - 160, y: centerY - 120 });
              }
            };
            input.click();
          }}
          onDeleteSelected={handleDeleteSelected}
          onClearStage={() => setShowClearConfirm(true)}
        />

        {/* (6) 左下角视口滑块与快捷键帮助 (Screen HUD) */}
        <CanvasZoomControls
          scale={viewport.k}
          theme={theme}
          isMiniMapOpen={isMiniMapOpen}
          onScaleChange={(newScale) => {
            const targetK = Math.max(0.05, Math.min(5.0, newScale));
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            setViewport((prev) => ({
              x: cx - (cx - prev.x) * (targetK / prev.k),
              y: cy - (cy - prev.y) * (targetK / prev.k),
              k: targetK,
            }));
          }}
          onReset={handleFitView}
          onToggleMiniMap={() => setIsMiniMapOpen((prev) => !prev)}
        />

        {/* (7) 全局右键上下文菜单 (Screen HUD) */}
        {contextMenuTarget && (
          <CanvasContextMenu
            target={contextMenuTarget}
            theme={theme}
            hasImageContent={Boolean(
              activeImageCards.find((c) => c.id === contextMenuTarget.nodeId)?.image
            )}
            onClose={() => setContextMenuTarget(null)}
            onDuplicate={(nodeId) => handleDuplicateCard(nodeId)}
            onDelete={(nodeId) => handleDeleteCard(nodeId)}
            onSetAsReference={(nodeId) => {
              const card = activeImageCards.find((c) => c.id === nodeId);
              if (card?.image) handleSetAsReference(card.image);
            }}
            onDownload={(nodeId) => {
              const card = activeImageCards.find((c) => c.id === nodeId);
              if (card?.image) handleDownload(card.image);
            }}
            onAddImageAt={(wx, wy) => handleCreateGeneratorAt(wx, wy)}
            onAddNoteAt={(wx, wy) => handleAddTextNote(wx, wy)}
            onResetView={handleFitView}
            onClearStage={() => setShowClearConfirm(true)}
          />
        )}

        {/* 5. 视口居中空状态引导 (Screen HUD: 永远居中视口，定宽排版杜绝中文字符坍塌，丝滑淡出) */}
        <div
          className={`absolute inset-0 flex items-center justify-center p-6 z-20 transition-all duration-300 ${
            activeImageCards.length === 0 && textNotes.length === 0 && !isGenerating
              ? 'opacity-100 scale-100 pointer-events-none'
              : 'opacity-0 scale-95 pointer-events-none select-none'
          }`}
        >
          <div
            className={`w-[380px] max-w-[calc(100vw-32px)] rounded-3xl border backdrop-blur-xl p-5 sm:p-6 shadow-2xl transition-all select-none ${
              isLight
                ? 'border-slate-200/90 bg-white/90 text-slate-800 shadow-slate-200/50'
                : 'border-zinc-800/90 bg-zinc-900/90 text-zinc-100 shadow-black/80'
            }`}
          >
              <div className="flex items-center gap-2.5 mb-3 font-semibold text-base tracking-tight">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span>{t('workbench.emptyStageTitle')}</span>
              </div>
              <p className="text-xs opacity-70 leading-relaxed mb-5">
                {t('workbench.emptyStageDesc')}
              </p>
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={handleTrySamplePrompt}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer shadow-xs text-center whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{t('workbench.trySamplePrompt')}</span>
                </button>
                <button
                  onClick={openDrawer}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer text-center whitespace-nowrap flex items-center justify-center gap-1.5 ${
                    isLight
                      ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                      : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 text-violet-500" />
                  <span>{t('workbench.openPocketDrawer')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* 6. 底部快捷操作信息岛 (Screen HUD) */}
      <footer className="absolute bottom-4 left-4 right-4 z-20 pointer-events-none flex justify-start">
        <div
          className={`px-3.5 py-1.5 sm:py-2 rounded-2xl backdrop-blur-xl border text-[11px] sm:text-xs shadow-xl flex items-center gap-2 max-w-full overflow-hidden ${
            isLight
              ? 'bg-white/90 border-slate-200 text-slate-600'
              : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
          <span className="truncate">{t('workbench.bottomIslandHint')}</span>
        </div>
      </footer>

      {/* 5. 清空台面确认弹窗 (非阻塞卡片式) */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-100"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl ${
              isLight
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-zinc-900 border-zinc-800 text-zinc-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 font-semibold text-sm mb-2 text-red-500">
              <Trash2 className="w-4 h-4" />
              <span>{t('workbench.clearStage')}</span>
            </div>
            <p className="text-xs opacity-80 leading-relaxed mb-4">
              {t('workbench.clearStageConfirm')}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmClearStage}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-sm"
              >
                {t('workbench.clearStage')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 图片裁切模态框 */}
      {cropTarget && (
        <CanvasImageCropModal
          theme={theme}
          imageUrl={cropTarget.image.dataUrl}
          onConfirm={handleConfirmCrop}
          onClose={() => setCropTarget(null)}
        />
      )}

      {/* 7. 原分辨率大图 Lightbox 弹窗 */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-6 select-none animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-12 right-0 flex items-center gap-2">
              <button
                onClick={() => handleDownload(lightboxImage)}
                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-white transition-colors cursor-pointer"
                title={t('workbench.downloadImage')}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={lightboxImage.dataUrl}
              alt={lightboxImage.prompt || 'Original'}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
              }}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl border border-zinc-800"
            />
            {lightboxImage.prompt && (
              <div className="mt-3 text-xs text-zinc-400 max-w-xl text-center line-clamp-2 px-4">
                {lightboxImage.prompt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. 3D 相机视角转换模态框 */}
      {angleModalTarget && (
        <CanvasImageAngleModal
          image={angleModalTarget.image}
          open={Boolean(angleModalTarget)}
          theme={theme}
          onClose={() => setAngleModalTarget(null)}
          onConfirm={handleConfirmAngle}
        />
      )}

      {/* 9. 九宫格切图模态框 */}
      {splitModalTarget && (
        <CanvasImageSplitModal
          image={splitModalTarget.image}
          open={Boolean(splitModalTarget)}
          theme={theme}
          onClose={() => setSplitModalTarget(null)}
          onConfirm={handleConfirmSplit}
        />
      )}

      {/* 10. 安全分辨率档位高清放大模态框 (MAX 4096px 防暴增) */}
      {upscaleModalTarget && (
        <CanvasImageUpscaleModal
          open={Boolean(upscaleModalTarget)}
          dataUrl={upscaleModalTarget.image.dataUrl}
          theme={theme}
          onClose={() => setUpscaleModalTarget(null)}
          onConfirm={handleConfirmUpscale}
        />
      )}
    </div>
  );
};

export default App;
