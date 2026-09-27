import { useEffect, useRef } from 'react';
import { db } from '../db';
import type { GenerationFinishedMessage } from '../types';

/** 存活探针间隔：远低于每秒 IPC 的频率（AGENTS.md 禁止高频 IPC），又远短于 5 分钟兜底窗口 */
const GENERATION_PROBE_INTERVAL_MS = 30_000;

/**
 * 生成进行中定期向后台发送 CHECK_GENERATION_STATUS。
 * 该消息本身会唤醒已被挂起/崩溃的 Service Worker，后台当场判定任务是否已丢失并收敛为 failed（并广播结束）；
 * 当后台回报任务已不在运行、而前台错过了结束广播时，按数据库最终状态合成一条结束消息交给 onFinished，
 * 让调用方复用与后台广播完全相同的收尾逻辑。
 */
export function useGenerationLivenessProbe(
  taskId: string | null,
  enabled: boolean,
  onFinished: (message: GenerationFinishedMessage) => void
): void {
  // 回调经 ref 解耦，避免其随渲染变化导致定时器反复重建
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!enabled || !taskId) return;
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    let disposed = false;
    const probe = () => {
      chrome.runtime.sendMessage({ action: 'CHECK_GENERATION_STATUS', taskId }, (resp) => {
        if (chrome.runtime?.lastError || disposed || resp?.isRunning !== false) return;
        db.generationTasks
          .get(taskId)
          .then((task) => {
            if (disposed || task?.status === 'generating') return;
            onFinishedRef.current({
              action: 'IMAGE_GENERATION_FINISHED',
              taskId,
              status: task?.status ?? 'failed',
              error: task?.error,
            });
          })
          .catch((err) => console.warn('[useGenerationLivenessProbe] Failed to read task:', err));
      });
    };

    const timer = setInterval(probe, GENERATION_PROBE_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [taskId, enabled]);
}
