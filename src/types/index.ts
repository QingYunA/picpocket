import type { ImageAspectRatio } from './imageGeneration';

export interface InspirationItem {
  id?: number;
  originalBlob: Blob;
  thumbnailBlob?: Blob;
  sourceUrl?: string;
  pageTitle?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  createdAt: number;
  tags: string[];
  status: 'pending' | 'analyzing' | 'analyzed' | 'failed' | 'generated';
  folderId?: number | null;
}

export interface FolderItem {
  id?: number;
  name: string;
  parentId?: number | null;
  order?: number;
  createdAt: number;
}

export interface ProMembership {
  isPro: boolean;
  licenseKey?: string;
  plan?: 'monthly' | 'yearly';
  tier?: 'pro' | 'blogger' | 'lifetime';
  quotaRemaining?: number;
  totalQuota?: number;
  visionQuotaRemaining?: number;
  visionTotalQuota?: number;
  imageQuotaRemaining?: number;
  imageTotalQuota?: number;
  note?: string;
  activatedAt?: number;
  expiresAt?: number;
}

export interface TextElementSlot {
  id: string;
  role: 'headline' | 'subheadline' | 'body_text' | 'badge_slogan' | 'other';
  originalText: string;
  userText?: string;
  fontStyle?: string;
  colorAndEffects?: string;
  layoutPlacement?: string;
  casing?: string;
}

export interface ReversePromptPreset {
  id: string;
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
  systemPromptZh: string;
  systemPromptEn: string;
  isBuiltin?: boolean;
}

export interface PromptResult {
  id?: number;
  itemId: number;
  model: string;
  subject: string[];
  style: string[];
  lighting: string[];
  composition: string[];
  masterPrompt: string;
  textSlots?: TextElementSlot[];
  templatePrompt?: string;
  latencyMs?: number;
  createdAt: number;
  isOriginalPrompt?: boolean;
}

export type Language = 'zh' | 'en';

export interface UserSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  visionChannels?: VisionChannel[];
  activeVisionChannelId?: string;
  autoAnalyzeOnCapture: boolean;
  language: Language;
  enableHoverBadge?: boolean;
  hoverBadgePromptDismissed?: boolean;
  contextMenuMode?: 'direct-analyze' | 'direct-collect' | 'dual-menu';
  // Image Generation Settings
  imageApiKey?: string;
  imageBaseUrl?: string;
  imageModel?: string;
  imageChannels?: ImageChannel[];
  activeImageChannelId?: string;
  autoSaveGeneratedToGallery?: boolean;
  defaultImageAspectRatio?: ImageAspectRatio;
  // Pro Membership & Hosted Gateway
  proMembership?: ProMembership;
  hostedProxyUrl?: string;
  // Reverse Prompt Customization & Preferences
  reversePromptPresetId?: string;
  customReversePrompt?: string;
  workbenchPromptHeight?: number;
  // Local MCP Collaboration
  mcpSettings?: McpSettings;
}

export interface ImageChannel {
  id: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  models?: string[];
}

export interface VisionChannel {
  id: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface McpSettings {
  enabled: boolean;
  port: number;
  authToken: string;
  permissions: {
    read: boolean;
    write: boolean;
    generate: boolean;
  };
}

export interface CollaborationLogItem {
  id: string;
  timestamp: number;
  clientName: string;
  toolName: string;
  status: 'success' | 'blocked' | 'error';
  durationMs: number;
  summary: string;
  detail?: string;
}

export type FolderFilter = number | null | 'all' | 'uncategorized';


export * from './prompt';
export * from './imageGeneration';

export interface CaptureImageMessage {
  action: 'CAPTURE_IMAGE';
  src: string;
  sourceUrl: string;
  pageTitle: string;
  autoAnalyze?: boolean;
}

export interface ShowQuickFilingCapsuleMessage {
  action: 'SHOW_QUICK_FILING_CAPSULE';
  itemId: number;
  folders: FolderItem[];
  thumbDataUrl?: string;
  pageTitle?: string;
}

export interface UpdateItemFolderMessage {
  action: 'UPDATE_ITEM_FOLDER';
  itemId: number;
  folderId: number | null;
}

export interface ActiveGenerationState {
  taskId: string;
  startTime: number;
  prompt: string;
}

export interface ActiveAnalysisState {
  itemId: number;
  startTime: number;
  model?: string;
}

export interface StartImageAnalysisMessage {
  action: 'START_IMAGE_ANALYSIS';
  itemId: number;
  targetModel?: string;
  customPrompt?: string;
  startTime?: number;
}

export interface CancelImageAnalysisMessage {
  action: 'CANCEL_IMAGE_ANALYSIS';
  itemId: number;
}

export interface CheckAnalysisStatusMessage {
  action: 'CHECK_ANALYSIS_STATUS';
  itemId?: number;
}
