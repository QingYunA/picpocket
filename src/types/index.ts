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
  /** 已关闭新手引导卡片 */
  gettingStartedDismissed?: boolean;
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
  /** 托管（积分 / 兑换码）模式下选用的模型，与自备 Key 时的 model / imageModel 互不覆盖 */
  hostedVisionModel?: string;
  hostedImageModel?: string;
  /** 已完成「没填 Key 的选中渠道 → PicPocket 渠道」的一次性迁移 */
  picpocketChannelMigrated?: boolean;
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
export * from './meme';
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

/** 工作台「参考图反推」的持久化状态：参考图不在画廊库内，故与按 itemId 绑定的 ActiveAnalysisState 分开存放 */
export interface ActiveReferenceAnalysisState {
  requestId: string;
  startTime: number;
  /** running：后台执行中；done / failed：后台已收敛，等待前台（可能刚重新打开）消费 */
  status: 'running' | 'done' | 'failed';
  /** 发起时的提示词快照，前台恢复时据此判断用户之后是否又改过提示词 */
  promptSnapshot?: string;
  masterPrompt?: string;
  error?: string;
}

export interface StartReferenceAnalysisMessage {
  action: 'START_REFERENCE_ANALYSIS';
  requestId: string;
  /** data: URL（或 http(s) 图片地址）；Blob 无法跨 chrome.runtime.sendMessage 结构化克隆 */
  imageUrl: string;
  startTime?: number;
  promptSnapshot?: string;
}

export interface CancelReferenceAnalysisMessage {
  action: 'CANCEL_REFERENCE_ANALYSIS';
  requestId: string;
}

export interface CheckReferenceAnalysisStatusMessage {
  action: 'CHECK_REFERENCE_ANALYSIS_STATUS';
  requestId: string;
}

/** 后台收敛后向前台广播的结果（前台已关闭时广播无人接收，结果以持久化状态为准） */
export interface ReferenceAnalysisFinishedMessage {
  action: 'REFERENCE_ANALYSIS_FINISHED';
  requestId: string;
  status: 'success' | 'failed' | 'cancelled';
  masterPrompt?: string;
  error?: string;
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
