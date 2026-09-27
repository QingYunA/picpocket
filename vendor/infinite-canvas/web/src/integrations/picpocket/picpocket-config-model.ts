import type { UserSettings } from "@picpocket/types";
import { enabledImageModels } from "@picpocket/config/imageChannels";

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

export function buildPicPocketCanvasConfig(settings: UserSettings): Partial<AiConfig> {
    const imageModel = settings.imageModel || "gpt-image-2.5-sunburst";
    const visionModel = settings.model || "gpt-4o";
    const managedKey = settings.proMembership?.isPro ? "pro-managed" : "";
    const imageChannels: ModelChannel[] = settings.imageChannels
        ? settings.imageChannels.map((channel) => ({
            id: channel.id === "legacy-image" ? "picpocket-image" : `picpocket-image-${channel.id}`,
            name: channel.name,
            baseUrl: channel.baseUrl,
            apiKey: channel.apiKey || settings.apiKey || managedKey,
            apiFormat: "openai" as const,
            models: enabledImageModels(channel).map((name) => ({ name, capability: "image" as const })),
        }))
        : [{
            id: "picpocket-image",
            name: "PicPocket Image",
            baseUrl: settings.imageBaseUrl || settings.baseUrl || "https://api.openai.com/v1",
            apiKey: settings.imageApiKey || settings.apiKey || managedKey,
            apiFormat: "openai",
            models: [{ name: imageModel, capability: "image" }],
        }];
    const activeImageId = settings.activeImageChannelId === "legacy-image" ? "picpocket-image" : `picpocket-image-${settings.activeImageChannelId}`;
    const defaultImageChannel = imageChannels.find((channel) => channel.id === activeImageId) || imageChannels[0];
    const selectedImageModel = defaultImageChannel?.models.find((entry) => entry.name === imageModel)?.name || defaultImageChannel?.models[0]?.name || imageModel;
    const defaultImageValue = defaultImageChannel ? `${defaultImageChannel.id}::${selectedImageModel}` : "";
    const visionChannel: ModelChannel = {
        id: "picpocket-vision",
        name: "PicPocket Vision",
        baseUrl: settings.baseUrl || "https://api.openai.com/v1",
        apiKey: settings.apiKey || managedKey,
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
