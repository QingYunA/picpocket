import type { InstalledPlugin } from "@/stores/canvas/use-plugin-store";

const unavailable = () => {
    throw new Error("Dynamic plugins are unavailable in the PicPocket extension");
};

export async function ensurePluginsLoaded(): Promise<void> {}

export async function installPluginFromUrl(): Promise<never> {
    return unavailable();
}

export async function updatePlugin(_record: InstalledPlugin): Promise<never> {
    return unavailable();
}

export async function setPluginEnabled(_record: InstalledPlugin, _enabled: boolean): Promise<never> {
    return unavailable();
}

export function uninstallPlugin(_id: string): never {
    return unavailable();
}
