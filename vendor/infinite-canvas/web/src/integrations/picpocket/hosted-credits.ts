import { PICPOCKET_CHANNEL_ID } from "@picpocket/config/hostedModels";

import { PICPOCKET_MANAGED_KEY, PICPOCKET_VISION_CHANNEL_ID, canvasImageChannelId } from "./picpocket-config-model";

export type HostedCanvasSelection = { kind: "image" | "vision"; model: string };

const IMAGE_CHANNEL_ID = canvasImageChannelId(PICPOCKET_CHANNEL_ID);
const VISION_CHANNEL_ID = PICPOCKET_VISION_CHANNEL_ID;

/**
 * 画布节点当前选中的「渠道::模型」是否走 PicPocket 官方托管（按积分计费）。
 * 生图看渠道 ID；文本（反推）看 vision 渠道是否仍由 PicPocket 托管，自带 Key 时不计积分。
 */
export function hostedCanvasSelection(
    mode: string,
    modelValue: string | undefined,
    channels: ReadonlyArray<{ id: string; apiKey: string }> | undefined,
): HostedCanvasSelection | null {
    if (!modelValue) return null;
    const separator = modelValue.indexOf("::");
    if (separator < 0) return null;
    const channelId = modelValue.slice(0, separator);
    const model = modelValue.slice(separator + 2);
    if (!model) return null;
    if (mode === "image" && channelId === IMAGE_CHANNEL_ID) return { kind: "image", model };
    if (mode === "text" && channelId === VISION_CHANNEL_ID) {
        const managed = channels?.find((channel) => channel.id === VISION_CHANNEL_ID)?.apiKey === PICPOCKET_MANAGED_KEY;
        return managed ? { kind: "vision", model } : null;
    }
    return null;
}
