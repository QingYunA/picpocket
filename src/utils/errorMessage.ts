/**
 * PicPocket 全局安全错误处理与清洗模块
 * 
 * 深度参考与对齐 Infinite Canvas (readApiErrorMessage, readStatusError, htmlError)
 * 
 * 核心目标：
 * 1. 拦截与剥离任何 HTML 报错页面，绝不让整屏代码糊在用户脸上 (Zero-HTML Invariant)；
 * 2. 状态码与超时语义化纯中文人话映射；
 * 3. 严格截断（100 字符以内），杜绝撑爆 UI 视口。
 */

const STATUS_ERROR_MESSAGES: Record<number, string> = {
  401: '鉴权失败或额度不足，请检查 API Key 或激活码设置',
  403: '鉴权失败或额度不足，请检查 API Key 或激活码设置',
  404: '接口地址不存在（404），请检查 Base URL 和模型选择',
  413: '参考图体积超出服务端限制（413），建议使用较小分辨率或纯提示词生图',
  429: '请求被限流或频次超限（429），请稍候 1~2 分钟后再试',
  502: '网关错误（502），生图服务暂时不可用，请稍后重试',
  503: '服务繁忙（503），模型推理服务正在维护，请稍后重试',
  504: '网关超时（504），服务端未在预期时间内响应，请稍后重试',
  524: '生图请求超时（Cloudflare 524），接口长时间未响应，请稍后重试或更换渠道',
};

export function readStatusError(status: number | undefined, fallback: string): string {
  if (!status) return fallback;
  return STATUS_ERROR_MESSAGES[status] || `请求失败 (HTTP ${status})，请检查 Base URL 与凭据设置`;
}

export function readApiErrorMessage(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      const inner = readApiErrorMessage(parsed) || value;
      if (inner === value && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
        return '';
      }
      return inner;
    } catch {
      // 检测 HTML 错误页面 (Nginx / Cloudflare / Gateway 错误页)
      if (/<[a-z][\s\S]*>/i.test(value) || value.includes('<!DOCTYPE') || value.includes('<html')) {
        const plainText = value
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // 统一通过单一真理源提取状态特征
        if (/524/i.test(value)) return STATUS_ERROR_MESSAGES[524]!;
        if (/504/i.test(value) || /gateway timeout/i.test(value)) return STATUS_ERROR_MESSAGES[504]!;
        if (/413/i.test(value) || /too large/i.test(value)) return STATUS_ERROR_MESSAGES[413]!;
        if (/502/i.test(value) || /bad gateway/i.test(value)) return STATUS_ERROR_MESSAGES[502]!;
        if (/timeout/i.test(value)) return STATUS_ERROR_MESSAGES[524]!;

        const preview = plainText ? `${plainText.slice(0, 80)}...` : '网关返回了异常页面';
        return `服务返回了 HTML 错误页面 (${preview})`;
      }
      return value;
    }
  }

  if (typeof value !== 'object') return '';

  const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
  const errorMsg =
    typeof payload.error === 'string'
      ? payload.error
      : (payload.error as { message?: unknown })?.message;

  return (
    readApiErrorMessage(payload.msg) ||
    readApiErrorMessage(payload.message) ||
    readApiErrorMessage(errorMsg) ||
    readApiErrorMessage(payload.detail) ||
    ''
  );
}

/**
 * 「积分不足」错误的不可见标记（U+2063 隐形分隔符）。
 * 错误消息会经 String(err) / chrome.runtime 消息 / 任务记录落库后才到达 UI，Error 子类与错误码都带不过去，
 * 而按本地化文案反查又会随语言与措辞失效，所以在消息开头附一个不可见字符，UI 据此显示「去升级」入口。
 * 它不是空白字符，能穿过 formatSafeErrorMessage 的清洗与截断。
 */
const INSUFFICIENT_CREDITS_MARKER = '\u2063';

export function markInsufficientCredits(message: string): string {
  return `${INSUFFICIENT_CREDITS_MARKER}${message}`;
}

export function isInsufficientCreditsMessage(message: unknown): boolean {
  return typeof message === 'string' && message.includes(INSUFFICIENT_CREDITS_MARKER);
}

/**
 * 全局格式化安全错误信息：无论传入的是什么异常，输出保证人话、无 HTML、且绝对不超过 100 字符。
 */
export function formatSafeErrorMessage(rawError: unknown, status?: number): string {
  if (!rawError && !status) return '生成失败，请稍后重试';

  let rawStr = '';
  if (rawError instanceof Error) {
    rawStr = rawError.message;
  } else if (typeof rawError === 'string') {
    rawStr = rawError;
  } else if (typeof rawError === 'object' && rawError !== null) {
    rawStr = readApiErrorMessage(rawError);
  }

  // 1. 尝试通过 readApiErrorMessage 提取解析结果
  let msg = readApiErrorMessage(rawStr);

  // 2. 如果提取出来仍然为空，或者原始串是标准 HTTP status 场景
  if (!msg && status) {
    msg = readStatusError(status, '生图请求异常');
  } else if (!msg) {
    msg = '生成遇到未知异常，请检查网络或重试';
  }

  // 3. 特殊关键词直译人话（容错）
  if (/timeout/i.test(msg) || /timed? ?out/i.test(msg) || /524/i.test(msg)) {
    msg = STATUS_ERROR_MESSAGES[524]!;
  } else if (/413/i.test(msg) || /too large/i.test(msg)) {
    msg = STATUS_ERROR_MESSAGES[413]!;
  }

  // 4. 终极防爆：强行去除残留的任意 HTML 标签
  msg = msg.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // 5. 严格字数熔断在 100 字符以内
  if (msg.length > 100) {
    return `${msg.slice(0, 97)}...`;
  }
  return msg;
}
