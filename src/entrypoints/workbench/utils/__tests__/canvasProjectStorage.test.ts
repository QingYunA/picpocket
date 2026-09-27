import { describe, it, expect } from 'vitest';
import type { CanvasCardItem, CanvasTextNote, NodePosition, ViewportTransform } from '../../types';
import {
  initializeCanvasProjects,
  createCanvasProject,
  renameCanvasProject,
  deleteCanvasProject,
  updateCanvasProjectState,
} from '../canvasProjectStorage';

describe('canvasProjectStorage (Multi-Canvas Project Management)', () => {
  const sampleCard: CanvasCardItem = {
    id: 'card_1',
    taskId: 'task_1',
    index: 0,
    image: {
      id: 'img_1',
      dataUrl: 'data:image/png;base64,aaa',
      prompt: 'cyberpunk city',
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      createdAt: 1000,
    },
  };

  const sampleNote: CanvasTextNote = {
    id: 'note_1',
    text: 'ideas here',
    x: 100,
    y: 100,
    createdAt: 1000,
  };

  it('should initialize with default project when no saved projects exist', () => {
    const { projects, activeProjectId } = initializeCanvasProjects({
      savedProjects: null,
      legacyCards: [],
      legacyPositions: {},
      legacyNotes: [],
      defaultTitle: '画板 1',
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]?.title).toBe('画板 1');
    expect(projects[0]?.cards).toEqual([]);
    expect(activeProjectId).toBe(projects[0]?.id);
  });

  it('should migrate legacy canvas data into default project without data loss', () => {
    const legacyPositions: Record<string, NodePosition> = { card_1: { x: 200, y: 300 } };
    const { projects, activeProjectId } = initializeCanvasProjects({
      savedProjects: null,
      legacyCards: [sampleCard],
      legacyPositions,
      legacyNotes: [sampleNote],
      defaultTitle: '画板 1',
    });

    expect(projects).toHaveLength(1);
    const defaultProject = projects[0]!;
    expect(defaultProject.cards).toHaveLength(1);
    expect(defaultProject.cards[0]?.id).toBe('card_1');
    expect(defaultProject.cardPositions['card_1']).toEqual({ x: 200, y: 300 });
    expect(defaultProject.textNotes).toHaveLength(1);
    expect(activeProjectId).toBe(defaultProject.id);
  });

  it('should keep existing projects and validate activeProjectId fallback', () => {
    const existing = [
      {
        id: 'proj_a',
        title: 'Project A',
        createdAt: 1000,
        updatedAt: 1000,
        cards: [],
        cardPositions: {},
        textNotes: [],
      },
    ];

    const { projects, activeProjectId } = initializeCanvasProjects({
      savedProjects: existing,
      activeIdCandidate: 'non_existent',
      legacyCards: [],
      legacyPositions: {},
      legacyNotes: [],
      defaultTitle: '画板 1',
    });

    expect(projects).toHaveLength(1);
    expect(activeProjectId).toBe('proj_a');
  });

  it('should create a new project and prepend it to the list', () => {
    const existing = [
      {
        id: 'proj_1',
        title: '画板 1',
        createdAt: 1000,
        updatedAt: 1000,
        cards: [],
        cardPositions: {},
        textNotes: [],
      },
    ];

    const { updatedProjects, newProject } = createCanvasProject(existing, '新概念画板');
    expect(updatedProjects).toHaveLength(2);
    expect(updatedProjects[0]?.id).toBe(newProject.id);
    expect(newProject.title).toBe('新概念画板');
    expect(newProject.cards).toEqual([]);
  });

  it('should rename a specific project by id', () => {
    const existing = [
      {
        id: 'proj_1',
        title: '原名称',
        createdAt: 1000,
        updatedAt: 1000,
        cards: [],
        cardPositions: {},
        textNotes: [],
      },
    ];

    const updated = renameCanvasProject(existing, 'proj_1', '更新后的画板');
    expect(updated[0]?.title).toBe('更新后的画板');
    expect(updated[0]?.updatedAt).toBeGreaterThan(1000);
  });

  it('should delete a project and keep fallback default project when all are deleted', () => {
    const existing = [
      {
        id: 'proj_1',
        title: '即将删除的画板',
        createdAt: 1000,
        updatedAt: 1000,
        cards: [],
        cardPositions: {},
        textNotes: [],
      },
    ];

    const { updatedProjects, nextActiveId } = deleteCanvasProject(existing, 'proj_1', '画板 1');
    expect(updatedProjects).toHaveLength(1);
    expect(updatedProjects[0]?.title).toBe('画板 1');
    expect(updatedProjects[0]?.id).not.toBe('proj_1');
    expect(nextActiveId).toBe(updatedProjects[0]?.id);
  });

  it('should delete specified project when multiple exist and pick remaining first', () => {
    const existing = [
      { id: 'proj_1', title: '画板 1', createdAt: 1000, updatedAt: 1000, cards: [], cardPositions: {}, textNotes: [] },
      { id: 'proj_2', title: '画板 2', createdAt: 2000, updatedAt: 2000, cards: [], cardPositions: {}, textNotes: [] },
    ];

    const { updatedProjects, nextActiveId } = deleteCanvasProject(existing, 'proj_1', '画板 1');
    expect(updatedProjects).toHaveLength(1);
    expect(updatedProjects[0]?.id).toBe('proj_2');
    expect(nextActiveId).toBe('proj_2');
  });

  it('should update project state patch and refresh updatedAt', () => {
    const existing = [
      {
        id: 'proj_1',
        title: '画板 1',
        createdAt: 1000,
        updatedAt: 1000,
        cards: [],
        cardPositions: {},
        textNotes: [],
      },
    ];

    const viewport: ViewportTransform = { x: 100, y: 200, k: 1.5 };
    const updated = updateCanvasProjectState(existing, 'proj_1', {
      cards: [sampleCard],
      viewport,
    });

    expect(updated[0]?.cards).toHaveLength(1);
    expect(updated[0]?.viewport).toEqual(viewport);
    expect(updated[0]?.updatedAt).toBeGreaterThan(1000);
  });
});
