/** 视觉反推单次请求上限：略小于前后台 180s 悬挂判定窗口，保证后台先于 UI 兜底收敛 */
export const ANALYSIS_REQUEST_TIMEOUT_MS = 170_000;

/** 单张生图请求上限：略小于前后台 300s 悬挂判定窗口 */
export const GENERATION_REQUEST_TIMEOUT_MS = 290_000;

const TIMEOUT_REASON = 'TimeoutError';

/**
 * 组合「用户取消」与「请求超时」为单一 AbortSignal。
 * 调用方必须在请求结束后调用 dispose 以清理定时器与监听。
 */
export function createTimeoutSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);

  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener('abort', onParentAbort, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', TIMEOUT_REASON));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

/**
 * 在「用户取消 + 超时」组合 signal 下执行请求；超时统一翻译为可读错误，用户取消则原样抛出 AbortError。
 * 计时覆盖 run 的全部耗时（含预处理），保证后台先于 UI 悬挂判定窗口收敛。
 */
export async function withRequestTimeout<T>(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const { signal, dispose } = createTimeoutSignal(parent, timeoutMs);
  try {
    return await run(signal);
  } catch (err: unknown) {
    if (isTimeoutAbort(signal)) {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    dispose();
  }
}

/** 判断 signal 是否因超时（而非用户取消）被中断 */
export function isTimeoutAbort(signal: AbortSignal): boolean {
  const reason = signal.reason as { name?: string } | undefined;
  return signal.aborted && reason?.name === TIMEOUT_REASON;
}
