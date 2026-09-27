import { getUserSettings } from "@picpocket/utils/storage";

import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { buildPicPocketCanvasConfig } from "./picpocket-config-model";

const SETTINGS_KEY = "promptsnap_settings";

export async function syncPicPocketConfig(): Promise<void> {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1") return;
    const settings = await getUserSettings();
    const patch = buildPicPocketCanvasConfig(settings);
    const current = useConfigStore.getState().config;
    const enabledModels = patch.models || [];
    if (enabledModels.includes(current.imageModel)) patch.imageModel = current.imageModel;
    if (enabledModels.includes(current.model)) patch.model = current.model;
    const updateConfig = useConfigStore.getState().updateConfig;
    (Object.entries(patch) as Array<[keyof AiConfig, AiConfig[keyof AiConfig]]>).forEach(([key, value]) => {
        updateConfig(key, value);
    });
}

export function subscribePicPocketConfig(): () => void {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === "local" && changes[SETTINGS_KEY]) void syncPicPocketConfig();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
