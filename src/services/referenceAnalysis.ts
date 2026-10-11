import { dataUrlToBlob } from '../db';
import { isLikelyImageBlob } from '../utils/file';
import { classifyReferenceAnalysis, REFERENCE_ANALYSIS_ERROR } from '../utils/referenceAnalysisRecovery';
import type {
  ActiveReferenceAnalysisState,
  ReferenceAnalysisFinishedMessage,
  UserSettings,
} from '../types';

/**
 * 工作台「参考图反推」的后台任务内核。
 * 参考图不在画廊库内，无法复用按 itemId 绑定的 START_IMAGE_ANALYSIS；这里以前台生成的 requestId 标识任务，
 * 由 Service Worker 托管长请求（保活 + 超时由 analyzeImageWithAI 内部负责），结果同时「持久化 + 广播」：
 * 侧边栏开着时走广播，关闭后重新打开则靠持久化状态恢复。
 * 依赖全部注入，background.ts 只负责接线，便于单测。
 */

/** 拉取远程参考图的超时 */
const REFERENCE_FETCH_TIMEOUT_MS = 30_000;


export interface ReferenceAnalysisDeps {
  /** 内存中正在运行的任务，SW 冷启动后为空；是「仍在运行」的唯一事实来源 */
  active: Map<string, AbortController>;
  now: () => number;
  getSettings: () => Promise<UserSettings>;
  loadImage: (imageUrl: string, signal: AbortSignal) => Promise<Blob>;
  analyze: (blob: Blob, settings: UserSettings, signal: AbortSignal) => Promise<{ masterPrompt?: string }>;
  readState: () => Promise<ActiveReferenceAnalysisState | null>;
  writeState: (state: ActiveReferenceAnalysisState) => Promise<void>;
  clearState: (requestId?: string) => Promise<void>;
  broadcast: (message: ReferenceAnalysisFinishedMessage) => void;
  /** 启动 SW 保活心跳，返回停止函数 */
  startKeepAlive: () => () => void;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ParsedStartReferenceAnalysis {
  requestId: string;
  imageUrl: string;
  startTime: number;
  promptSnapshot?: string;
}

const MAX_REQUEST_ID_LENGTH = 128;
const ALLOWED_IMAGE_URL = /^(data:|https?:\/\/)/i;

/** 校验来自前台的启动消息：消息通道不可信，字段类型与来源 scheme 一律在此收口 */
export function parseStartReferenceAnalysisMessage(
  raw: unknown,
  now: number
): ParseResult<ParsedStartReferenceAnalysis> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid message' };
  const msg = raw as Record<string, unknown>;

  const requestId = msg.requestId;
  if (typeof requestId !== 'string' || !requestId || requestId.length > MAX_REQUEST_ID_LENGTH) {
    return { ok: false, error: 'Invalid requestId' };
  }

  const imageUrl = msg.imageUrl;
  if (typeof imageUrl !== 'string' || !ALLOWED_IMAGE_URL.test(imageUrl)) {
    return { ok: false, error: 'Invalid imageUrl' };
  }

  const rawStart = msg.startTime;
  const startTime =
    typeof rawStart === 'number' && Number.isFinite(rawStart) && rawStart > 0 ? Math.min(rawStart, now) : now;

  const promptSnapshot = typeof msg.promptSnapshot === 'string' ? msg.promptSnapshot : undefined;

  return {
    ok: true,
    value: promptSnapshot === undefined
      ? { requestId, imageUrl, startTime }
      : { requestId, imageUrl, startTime, promptSnapshot },
  };
}

/**
 * 在 SW 内把参考图还原为 Blob：data URL 走纯内存解码（SW 中 fetch(dataUrl) 会崩溃），
 * 远程地址走带超时的 fetch。不做任何压缩 —— 瞬态预处理由 analyzeImageWithAI 在外发边界完成。
 */
export async function loadReferenceImageBlob(
  imageUrl: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<Blob> {
  let blob: Blob;
  if (/^data:/i.test(imageUrl)) {
    blob = dataUrlToBlob(imageUrl);
  } else {
    const timeoutSignal = AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS);
    const res = await fetchImpl(imageUrl, { signal: AbortSignal.any([signal, timeoutSignal]) });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    blob = await res.blob();
  }
  if (!isLikelyImageBlob(blob)) throw new Error(REFERENCE_ANALYSIS_ERROR.invalidImage);
  return blob;
}

export interface StartReferenceAnalysisResponse {
  success: boolean;
  requestId?: string;
  alreadyRunning?: boolean;
  error?: string;
}

/** 持久化失败不阻断任务，但侧边栏关闭后将无法恢复结果，必须留下记录 */
function warnPersistFailed(requestId: string, err: unknown): void {
  console.warn(`[Background Reference Analysis ${requestId}] failed to persist state:`, err);
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : '';
}

/**
 * 处理 START_REFERENCE_ANALYSIS：同步校验并占位（先于任何 await，避免重复消息并发启动、
 * 也避免被冷启动自愈扫描误判为悬挂），随后持久化 running 状态并在后台执行。
 * response 用于立即回复前台；completion 仅在真正启动了后台执行时存在（测试用，生产无需等待）。
 */
export async function startReferenceAnalysis(
  raw: unknown,
  deps: ReferenceAnalysisDeps
): Promise<{ response: StartReferenceAnalysisResponse; completion?: Promise<void> }> {
  const parsed = parseStartReferenceAnalysisMessage(raw, deps.now());
  if (!parsed.ok) return { response: { success: false, error: parsed.error } };
  const { requestId, imageUrl, startTime, promptSnapshot } = parsed.value;

  if (deps.active.has(requestId)) {
    return { response: { success: true, requestId, alreadyRunning: true } };
  }
  // 持久化只有一个槽位，同一时刻只托管一个参考图反推
  if (deps.active.size > 0) {
    return { response: { success: false, error: REFERENCE_ANALYSIS_ERROR.busy } };
  }

  const controller = new AbortController();
  deps.active.set(requestId, controller);

  let settings: UserSettings;
  try {
    settings = await deps.getSettings();
  } catch (err) {
    deps.active.delete(requestId);
    return { response: { success: false, error: errorText(err) || 'Failed to load settings' } };
  }

  const runningState: ActiveReferenceAnalysisState = {
    requestId,
    startTime,
    status: 'running',
    ...(promptSnapshot === undefined ? {} : { promptSnapshot }),
  };
  await deps.writeState(runningState).catch((err) => warnPersistFailed(requestId, err));

  // 等待设置与落盘期间任务已被纠偏扫描中止：不再启动请求
  if (controller.signal.aborted) {
    return { response: { success: true, requestId } };
  }

  const completion = runReferenceAnalysis(runningState, imageUrl, settings, controller, deps);
  return { response: { success: true, requestId }, completion };
}

async function runReferenceAnalysis(
  running: ActiveReferenceAnalysisState,
  imageUrl: string,
  settings: UserSettings,
  controller: AbortController,
  deps: ReferenceAnalysisDeps
): Promise<void> {
  const { requestId } = running;
  const stopKeepAlive = deps.startKeepAlive();
  const settle = async (
    state: ActiveReferenceAnalysisState,
    message: ReferenceAnalysisFinishedMessage
  ) => {
    // 先落盘再广播：前台已关闭时广播无人接收，重新打开后靠持久化状态恢复
    await deps.writeState(state).catch((err) => warnPersistFailed(requestId, err));
    deps.broadcast(message);
  };

  try {
    const blob = await deps.loadImage(imageUrl, controller.signal);
    const result = await deps.analyze(blob, settings, controller.signal);
    // 已被纠偏扫描中止（超时或判定悬挂）并收敛为 failed，此处不得再覆盖
    if (controller.signal.aborted) return;

    const masterPrompt = result.masterPrompt;
    if (masterPrompt) {
      await settle(
        { ...running, status: 'done', masterPrompt },
        { action: 'REFERENCE_ANALYSIS_FINISHED', requestId, status: 'success', masterPrompt }
      );
    } else {
      // 未得到有效提示词：不带错误文案，由前台沿用原有的「反推失败」提示
      await settle(
        { ...running, status: 'failed' },
        { action: 'REFERENCE_ANALYSIS_FINISHED', requestId, status: 'failed' }
      );
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    const error = errorText(err);
    console.error(`[Background Reference Analysis Error ${requestId}]:`, err);
    await settle(
      { ...running, status: 'failed', ...(error ? { error } : {}) },
      { action: 'REFERENCE_ANALYSIS_FINISHED', requestId, status: 'failed', ...(error ? { error } : {}) }
    );
  } finally {
    stopKeepAlive();
    deps.active.delete(requestId);
  }
}

/**
 * 读取并纠偏持久化状态（SW 冷启动自愈与前台存活探针共用）：
 * running 但内存已无任务（SW 重启）或超出有效窗口的状态，收敛为 failed 供前台消费，杜绝永久悬挂
 */
export async function reconcileReferenceAnalysis(
  deps: ReferenceAnalysisDeps
): Promise<ActiveReferenceAnalysisState | null> {
  const state = await deps.readState();
  if (!state) return null;

  const verdict = classifyReferenceAnalysis(state, {
    now: deps.now(),
    isActiveInMemory: deps.active.has(state.requestId),
  });
  if (verdict !== 'interrupted' && verdict !== 'timed-out') return state;

  deps.active.get(state.requestId)?.abort();
  deps.active.delete(state.requestId);
  const settled: ActiveReferenceAnalysisState = {
    ...state,
    status: 'failed',
    error: verdict === 'interrupted' ? REFERENCE_ANALYSIS_ERROR.interrupted : REFERENCE_ANALYSIS_ERROR.timedOut,
  };
  await deps.writeState(settled).catch((err) => warnPersistFailed(state.requestId, err));
  return settled;
}

/** 处理 CHECK_REFERENCE_ANALYSIS_STATUS：返回是否仍在运行以及纠偏后的持久化状态 */
export async function checkReferenceAnalysisStatus(
  raw: { requestId?: unknown },
  deps: ReferenceAnalysisDeps
): Promise<{ isRunning: boolean; state: ActiveReferenceAnalysisState | null }> {
  const requestId = raw?.requestId;
  if (typeof requestId !== 'string' || !requestId) return { isRunning: false, state: null };

  const state = await reconcileReferenceAnalysis(deps);
  if (!state || state.requestId !== requestId) return { isRunning: false, state: null };
  return { isRunning: state.status === 'running' && deps.active.has(requestId), state };
}
