import type { GenerationBatchTask } from '../types';

/** 冷启动宽限期：前台刚创建、其 START 消息可能正是唤醒 SW 的事件，此窗口内的任务不视为悬挂 */
export const STALE_GENERATION_GRACE_MS = 30_000;

/**
 * 新建任务宽限期：前台先写库（参考图入池、创建任务记录）再发 START，
 * 此窗口内即便 SW 早已启动、内存中尚无该任务，也不视为丢失
 */
export const START_IN_FLIGHT_GRACE_MS = 60_000;

/** 生成任务的有效执行窗口，与前后台 300s 悬挂判定窗口保持一致 */
export const GENERATION_ACTIVE_WINDOW_MS = 300_000;

/** 前台降级任务的有效执行窗口 */
export const FOREGROUND_GENERATION_WINDOW_MS = GENERATION_ACTIVE_WINDOW_MS;

export type GeneratingTaskVerdict = 'keep' | 'interrupted' | 'timed-out';

/**
 * 后台冷启动自愈 / 存活探针判定一个 generating 任务的去留：
 * - keep：仍在后台内存执行、处于冷启动或新建宽限期，或是有效窗口内的前台任务
 * - interrupted：后台执行的任务因 SW 重启而丢失
 * - timed-out：前台任务超出有效窗口仍未收敛（页面已关闭等），避免永久悬挂
 */
export function classifyGeneratingTask(
  task: Pick<GenerationBatchTask, 'createdAt' | 'executor'>,
  ctx: { now: number; bootTime: number; isActiveInMemory: boolean }
): GeneratingTaskVerdict {
  if (ctx.isActiveInMemory) return 'keep';
  if (task.executor === 'foreground') {
    return ctx.now - task.createdAt > FOREGROUND_GENERATION_WINDOW_MS ? 'timed-out' : 'keep';
  }
  if (task.createdAt > ctx.bootTime - STALE_GENERATION_GRACE_MS) return 'keep';
  if (ctx.now - task.createdAt < START_IN_FLIGHT_GRACE_MS) return 'keep';
  return 'interrupted';
}
