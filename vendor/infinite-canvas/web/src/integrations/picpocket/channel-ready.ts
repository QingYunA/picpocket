import { PICPOCKET_MANAGED_KEY } from "./picpocket-config-model";

/**
 * 渠道是否可用于生成：自己的渠道要有 Key 和 baseUrl；
 * PicPocket 官方托管渠道由扩展后台按账号计费，没有 baseUrl（Key 是占位符），只看有没有选中模型。
 */
export function isModelChannelReady(model: string, channel: { baseUrl: string; apiKey: string }): boolean {
    if (!model.trim()) return false;
    if (channel.apiKey === PICPOCKET_MANAGED_KEY) return true;
    return Boolean(channel.baseUrl.trim() && channel.apiKey.trim());
}
