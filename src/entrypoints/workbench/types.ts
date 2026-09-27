import type { GeneratedImage } from '@/types';

export type CanvasTheme = 'dark' | 'light';
export type CanvasToolMode = 'select' | 'pan';
export type CanvasBackgroundMode = 'lines' | 'dots' | 'blank';
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface ViewportTransform {
  x: number;
  y: number;
  k: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export type CanvasNodeStatus = 'idle' | 'loading' | 'success' | 'error';

export interface CanvasCardItem {
  id: string;
  title?: string;
  width?: number;
  height?: number;
  image?: GeneratedImage;
  taskId?: string;
  index?: number;
  status?: CanvasNodeStatus;
  prompt?: string;
  model?: string;
  aspectRatio?: import('@/types').ImageAspectRatio;
  referenceImages?: string[];
  error?: string;
  elapsedSec?: number;
}

export type TextNoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'zinc';

export interface CanvasTextNote {
  id: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: TextNoteColor;
  createdAt: number;
}

export interface WorkbenchHandoffDraft {
  timestamp?: number;
  prompt?: string;
  model?: string;
  aspectRatio?: import('@/types').ImageAspectRatio;
  referenceImage?: string;
}

export const CONSOLE_HEIGHT_EXPANDED = 540;
export const CONSOLE_HEIGHT_COLLAPSED = 48;
export const CONSOLE_WIDTH_COLLAPSED = 260;
export const DRAFT_HANDOFF_TTL_MS = 5 * 60 * 1000;

export const CANVAS_RATIOS: { label: string; value: import('@/types').ImageAspectRatio }[] = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

export interface CanvasProject {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cards: CanvasCardItem[];
  cardPositions: Record<string, NodePosition>;
  textNotes: CanvasTextNote[];
  generatorPos?: NodePosition;
  viewport?: ViewportTransform;
}

