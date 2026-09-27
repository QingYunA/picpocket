import type {
  CanvasProject,
  CanvasCardItem,
  CanvasTextNote,
  NodePosition,
  ViewportTransform,
} from '../types';

export const CANVAS_PROJECTS_STORAGE_KEY = 'picpocket_canvas_projects';
export const ACTIVE_PROJECT_ID_STORAGE_KEY = 'picpocket_active_canvas_project_id';

export interface InitializeProjectsParams {
  savedProjects: CanvasProject[] | null;
  activeIdCandidate?: string | null;
  legacyCards: CanvasCardItem[];
  legacyPositions: Record<string, NodePosition>;
  legacyNotes: CanvasTextNote[];
  legacyViewport?: ViewportTransform;
  legacyGeneratorPos?: NodePosition;
  defaultTitle: string;
}

export interface InitializeProjectsResult {
  projects: CanvasProject[];
  activeProjectId: string;
}

/**
 * 初始化画板列表并实现旧版本数据的平滑自动迁移
 */
export function initializeCanvasProjects(params: InitializeProjectsParams): InitializeProjectsResult {
  const {
    savedProjects,
    activeIdCandidate,
    legacyCards,
    legacyPositions,
    legacyNotes,
    legacyViewport,
    legacyGeneratorPos,
    defaultTitle,
  } = params;

  // 1. 若已有持久化的有效项目列表
  if (savedProjects && Array.isArray(savedProjects) && savedProjects.length > 0) {
    const activeExists = activeIdCandidate
      ? savedProjects.some((p) => p.id === activeIdCandidate)
      : false;
    const activeProjectId = activeExists ? activeIdCandidate! : savedProjects[0]!.id;
    return {
      projects: savedProjects,
      activeProjectId,
    };
  }

  // 2. 首次进入或旧数据迁移：收拢旧版卡片与便签为默认画板
  const now = Date.now();
  const defaultProject: CanvasProject = {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: defaultTitle,
    createdAt: now,
    updatedAt: now,
    cards: Array.isArray(legacyCards) ? legacyCards : [],
    cardPositions: legacyPositions && typeof legacyPositions === 'object' ? legacyPositions : {},
    textNotes: Array.isArray(legacyNotes) ? legacyNotes : [],
    generatorPos: legacyGeneratorPos,
    viewport: legacyViewport || { x: 0, y: 0, k: 1 },
  };

  return {
    projects: [defaultProject],
    activeProjectId: defaultProject.id,
  };
}

/**
 * 创建新画板并置顶插入列表
 */
export function createCanvasProject(
  existingProjects: CanvasProject[],
  title: string
): { updatedProjects: CanvasProject[]; newProject: CanvasProject } {
  const now = Date.now();
  const projectTitle = title.trim();

  const newProject: CanvasProject = {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: projectTitle,
    createdAt: now,
    updatedAt: now,
    cards: [],
    cardPositions: {},
    textNotes: [],
    viewport: { x: 0, y: 0, k: 1 },
  };

  return {
    updatedProjects: [newProject, ...existingProjects],
    newProject,
  };
}

/**
 * 重命名指定画板
 */
export function renameCanvasProject(
  existingProjects: CanvasProject[],
  id: string,
  newTitle: string
): CanvasProject[] {
  const trimmed = newTitle.trim();
  if (!trimmed) return existingProjects;

  const now = Date.now();
  return existingProjects.map((p) => (p.id === id ? { ...p, title: trimmed, updatedAt: now } : p));
}

/**
 * 删除指定画板（若全部删除，自动兜底创建一个新空白画板，确保始终至少有 1 个画板可用）
 */
export function deleteCanvasProject(
  existingProjects: CanvasProject[],
  idToDelete: string,
  fallbackTitle: string
): { updatedProjects: CanvasProject[]; nextActiveId: string } {
  const remaining = existingProjects.filter((p) => p.id !== idToDelete);

  if (remaining.length === 0) {
    const fallback = createCanvasProject([], fallbackTitle);
    return {
      updatedProjects: fallback.updatedProjects,
      nextActiveId: fallback.newProject.id,
    };
  }

  return {
    updatedProjects: remaining,
    nextActiveId: remaining[0]!.id,
  };
}

/**
 * 局部更新指定画板状态
 */
export function updateCanvasProjectState(
  existingProjects: CanvasProject[],
  projectId: string,
  patch: Partial<Omit<CanvasProject, 'id' | 'createdAt'>>
): CanvasProject[] {
  const now = Date.now();
  return existingProjects.map((p) => {
    if (p.id !== projectId) return p;
    return {
      ...p,
      ...patch,
      updatedAt: now,
    };
  });
}
