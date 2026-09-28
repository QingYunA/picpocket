// 扩展构建专用：Chrome 应用商店禁止 MV3 扩展加载远程托管代码（GA4 / 百度统计脚本），
// 扩展内画布不做任何统计。接口与 analytics.ts 保持一致。
export function initAnalytics() {}

export function trackPageview(_path: string) {}
