import type { UserSettings } from "@picpocket/types";
import { enabledImageModels } from "@picpocket/config/imageChannels";
import type { AiConfig } from "@/stores/use-config-store";

function decodeChannelModel(value: string) {
    const separator = "::";
    const index = value.indexOf(separator);
    return index < 0 ? null : { channelId: value.slice(0, index), model: value.slice(index + separator.length) };
}

export function resolveCanvasImageSelection(
    settings: UserSettings,
    config: Pick<AiConfig, "model" | "imageModel">,
    selectedModel?: string,
): { model: string; channelId?: string } {
    const requestedValue = selectedModel || config.model || "";
    const requested = decodeChannelModel(requestedValue);
    if (!requested && requestedValue && settings.imageChannels?.length) {
        const matches = settings.imageChannels.filter((channel) => enabledImageModels(channel).includes(requestedValue));
        if (matches.length === 1) return { model: requestedValue, channelId: matches[0]!.id };
        if (matches.length > 1) throw new Error("This saved model exists in multiple channels. Please select its channel again.");
    }
    const selected = requested?.channelId.startsWith("picpocket-image-") || requested?.channelId === "picpocket-image"
        ? requested
        : decodeChannelModel(config.imageModel || "");
    const channelId = selected?.channelId === "picpocket-image"
        ? (settings.imageChannels ? "legacy-image" : undefined)
        : selected?.channelId.startsWith("picpocket-image-")
            ? selected.channelId.slice("picpocket-image-".length)
            : undefined;
    return { model: selected?.model || settings.imageModel || config.imageModel || config.model, channelId };
}
