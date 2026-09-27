import { useCallback, useRef } from 'react';
import { updateGenerationTask } from '../db';

/**
 * 前台降级生图（Service Worker 不可达时）的中断与所有权管理。
 * 同一组件同一时刻只允许一个前台生成任务：
 * - begin：开始新任务并取得所有权；
 * - cancel：中断当前任务、在本地落库 cancelled（SW 不可达，无法依赖后台写入），并立即释放所有权；
 * - release：请求收尾时调用，仅当仍持有所有权才返回 true，调用方据此复位界面，
 *   避免已取消的旧请求在新任务启动后误清其生成状态。
 */
export function useForegroundGeneration() {
  const controllerRef = useRef<AbortController | null>(null);

  const begin = useCallback((): AbortController => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  }, []);

  const cancel = useCallback((taskId: string, cancelledMessage: string): void => {
    const controller = controllerRef.current;
    if (!controller) return;
    controllerRef.current = null;
    controller.abort();
    updateGenerationTask(taskId, { status: 'cancelled', error: cancelledMessage }).catch((err) => {
      console.warn('[useForegroundGeneration] Failed to persist cancelled status:', err);
    });
  }, []);

  const release = useCallback((controller: AbortController): boolean => {
    if (controllerRef.current !== controller) return false;
    controllerRef.current = null;
    return true;
  }, []);

  return { begin, cancel, release };
}
