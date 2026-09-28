import type { UserSettings } from "@picpocket/types";
import { enabledImageModels, getImageChannels } from "@picpocket/config/imageChannels";
import { visionChannelMode } from "@picpocket/config/channelMode";
import { currentChannelModel } from "@picpocket/config/channelSelection";
import { HOSTED_IMAGE_MODELS, PICPOCKET_CHANNEL_ID } from "@picpocket/config/hostedModels";

import type { AiConfig, ModelCapability, ModelChannel } from "@/stores/use-config-store";

export function isPicPocketModelCapabilitySupported(capability: ModelCapability): capability is "image" | "text" {
    return capability === "image" || capability === "text";
}

export function isPicPocketCanvasNodeTypeSupported(type: string): boolean {
    return type !== "video" && type !== "audio";
}

export function picPocketModelSettingsRoute(capability: ModelCapability = "image"): string | null {
    if (!isPicPocketModelCapabilitySupported(capability)) return null;
    return capability === "text" ? "/models/vision" : "/models/image";
}

/** 画布只据渠道是否有 Key 判断可用；PicPocket 渠道的请求实际经由扩展的生图服务按账号计费，这里只是占位 */
const PICPOCKET_MANAGED_KEY = "picpocket-managed";

const canvasImageChannelId = (channelId: string) => (channelId === "legacy-image" ? "picpocket-image" : `picpocket-image-${channelId}`);

export function buildPicPocketCanvasConfig(settings: UserSettings): Partial<AiConfig> {
    const currentImage = currentChannelModel(settings, "image");
    const currentVision = currentChannelModel(settings, "vision");
    const visionModel = currentVision.model || "gpt-4o";
    const picpocketChannel: ModelChannel = {
        id: canvasImageChannelId(PICPOCKET_CHANNEL_ID),
        name: "PicPocket",
        baseUrl: "",
        apiKey: PICPOCKET_MANAGED_KEY,
        apiFormat: "openai",
        models: HOSTED_IMAGE_MODELS.map((name) => ({ name, capability: "image" as const })),
    };
    const ownChannels: ModelChannel[] = getImageChannels(settings).map((channel) => ({
        id: canvasImageChannelId(channel.id),
        name: channel.name,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey || settings.apiKey || "",
        apiFormat: "openai" as const,
        models: enabledImageModels(channel).map((name) => ({ name, capability: "image" as const })),
    }));
    const imageChannels = [picpocketChannel, ...ownChannels];
    const defaultImageChannel = imageChannels.find((channel) => channel.id === canvasImageChannelId(currentImage.channelId)) || imageChannels[0];
    const selectedImageModel = defaultImageChannel?.models.find((entry) => entry.name === currentImage.model)?.name || defaultImageChannel?.models[0]?.name || currentImage.model;
    const defaultImageValue = defaultImageChannel ? `${defaultImageChannel.id}::${selectedImageModel}` : "";
    const visionChannel: ModelChannel = {
        id: "picpocket-vision",
        name: "PicPocket Vision",
        baseUrl: settings.baseUrl || "https://api.openai.com/v1",
        apiKey: visionChannelMode(settings).kind === "picpocket" ? PICPOCKET_MANAGED_KEY : settings.apiKey,
        apiFormat: "openai",
        models: [{ name: visionModel, capability: "text" }],
    };
    return {
        channelMode: "local",
        channels: [...imageChannels, visionChannel],
        baseUrl: defaultImageChannel?.baseUrl || settings.imageBaseUrl || settings.baseUrl,
        apiKey: defaultImageChannel?.apiKey || settings.imageApiKey || settings.apiKey,
        models: [...imageChannels.flatMap((channel) => channel.models.map((entry) => `${channel.id}::${entry.name}`)), `${visionChannel.id}::${visionModel}`],
        model: defaultImageValue,
        imageModel: defaultImageValue,
        textModel: `${visionChannel.id}::${visionModel}`,
    };
}
