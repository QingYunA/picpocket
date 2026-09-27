import { resolvePocketCanvasAsset, type PocketCanvasAsset } from "./pocket-adapter";

const HANDOFF_KEY = "picpocket_infinite_canvas_handoff_v1";
const HANDOFF_TTL_MS = 5 * 60 * 1000;

type PocketCanvasHandoff = {
    assetId?: number;
    prompt?: string;
    referenceImage?: string;
    timestamp: number;
};

export async function queuePocketAssetHandoff(assetId: number): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await chrome.storage.local.set({
        [HANDOFF_KEY]: { assetId, timestamp: Date.now() } satisfies PocketCanvasHandoff,
    });
}

export type PocketCanvasLaunch = {
    asset: PocketCanvasAsset | null;
    prompt: string;
    referenceImage?: string;
};

export async function consumePocketCanvasHandoff(): Promise<PocketCanvasLaunch | null> {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const stored = await chrome.storage.local.get(HANDOFF_KEY);
    const handoff = stored[HANDOFF_KEY] as PocketCanvasHandoff | undefined;
    if (!handoff || Date.now() - handoff.timestamp > HANDOFF_TTL_MS) {
        if (handoff) await chrome.storage.local.remove(HANDOFF_KEY);
        return null;
    }
    await chrome.storage.local.remove(HANDOFF_KEY);
    const asset = typeof handoff.assetId === "number" ? await resolvePocketCanvasAsset(handoff.assetId) : null;
    return {
        asset,
        prompt: handoff.prompt || asset?.prompt || "",
        referenceImage: handoff.referenceImage,
    };
}

export function subscribePocketCanvasHandoff(onHandoff: () => void): () => void {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === "local" && changes[HANDOFF_KEY]?.newValue) onHandoff();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
