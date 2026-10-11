import type { ActiveReferenceAnalysisState } from '../types';

/** 参考图反推的有效执行窗口，与反推请求超时（170s）及 180s 悬挂判定窗口保持一致 */
export const REFERENCE_ANALYSIS_WINDOW_MS = 180_000;

export type ReferenceAnalysisVerdict =
  | 'none'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'timed-out';

/**
 * 判定持久化的参考图反推状态的去留（后台冷启动自愈 / 存活探针 / 前台挂载对齐共用）：
 * - running：后台仍在执行（或后台无法询问时仍处于有效窗口内）
 * - completed / failed：后台已收敛，等待前台消费
 * - interrupted：状态为 running 但 Service Worker 内存里已无此任务（SW 重启导致丢失）
 * - timed-out：超出有效窗口仍未收敛，避免永久悬挂
 * isActiveInMemory 为 undefined 表示无法向后台确认，仅按时间窗口兜底
 */
export function classifyReferenceAnalysis(
  state: ActiveReferenceAnalysisState | null | undefined,
  ctx: { now: number; isActiveInMemory: boolean | undefined }
): ReferenceAnalysisVerdict {
  if (!state) return 'none';
  if (state.status === 'done') return 'completed';
  if (state.status === 'failed') return 'failed';
  if (ctx.now - state.startTime >= REFERENCE_ANALYSIS_WINDOW_MS) return 'timed-out';
  if (ctx.isActiveInMemory === false) return 'interrupted';
  return 'running';
}

/**
 * 侧边栏关闭期间完成的反推：仅当提示词框自发起后未被用户改动时才回填，
 * 避免静默覆盖用户后来输入的内容
 */
export function shouldApplyRecoveredPrompt(
  promptSnapshot: string | undefined,
  currentPrompt: string
): boolean {
  return (promptSnapshot ?? '') === currentPrompt;
}
