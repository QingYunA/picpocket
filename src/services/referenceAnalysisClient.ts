import type { StartReferenceAnalysisMessage } from '../types';
import type { ReferenceAnalysisProbe } from '../utils/referenceAnalysisRecovery';

/**
 * 侧边栏侧的参考图反推通道：只负责把消息交给 Service Worker，长请求本身绝不在前台执行。
 * 后台不可达（扩展上下文失效等）时统一以失败 / null 返回，由调用方给出兜底提示。
 */

function sendToBackground<T>(message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        resolve(chrome.runtime?.lastError || !resp ? null : (resp as T));
      });
    } catch {
      resolve(null);
    }
  });
}

export async function requestReferenceAnalysis(
  params: Omit<StartReferenceAnalysisMessage, 'action'>
): Promise<{ success: boolean; error?: string }> {
  const resp = await sendToBackground<{ success: boolean; error?: string }>({
    action: 'START_REFERENCE_ANALYSIS',
    ...params,
  });
  return resp ?? { success: false };
}

export function probeReferenceAnalysis(requestId: string): Promise<ReferenceAnalysisProbe> {
  return sendToBackground<NonNullable<ReferenceAnalysisProbe>>({
    action: 'CHECK_REFERENCE_ANALYSIS_STATUS',
    requestId,
  });
}
