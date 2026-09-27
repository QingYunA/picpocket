import { db } from "@picpocket/db";

import type { CanvasNodeData, CanvasNodeImage } from "@/types/canvas";

const REGISTRY_KEY = "picpocket_canvas_generation_registry_v1";

type RegisteredGeneration = {
    taskId: string;
    prompt: string;
    startedAt: number;
    projectId: string;
    nodeId: string;
};

export type RecoveredGeneration = {
    taskId: string;
    prompt: string;
    projectId: string;
    nodeId: string;
    status: "success" | "failed" | "cancelled";
    images: CanvasNodeImage[];
    error?: string;
};

export async function registerCanvasGeneration(task: RegisteredGeneration): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const stored = await chrome.storage.local.get(REGISTRY_KEY);
    const current = Array.isArray(stored[REGISTRY_KEY]) ? (stored[REGISTRY_KEY] as RegisteredGeneration[]) : [];
    await chrome.storage.local.set({
        [REGISTRY_KEY]: [...current.filter((item) => item.taskId !== task.taskId), task],
    });
}

export async function completeCanvasGeneration(taskId: string): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const stored = await chrome.storage.local.get(REGISTRY_KEY);
    const current = Array.isArray(stored[REGISTRY_KEY]) ? (stored[REGISTRY_KEY] as RegisteredGeneration[]) : [];
    await chrome.storage.local.set({
        [REGISTRY_KEY]: current.filter((item) => item.taskId !== taskId),
    });
}

export async function recoverCanvasGenerations(projectId: string): Promise<RecoveredGeneration[]> {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.local) return [];
    const stored = await chrome.storage.local.get(REGISTRY_KEY);
    const registered = Array.isArray(stored[REGISTRY_KEY]) ? (stored[REGISTRY_KEY] as RegisteredGeneration[]) : [];
    const results: RecoveredGeneration[] = [];
    const { uploadImage } = await import("@/services/image-storage");
    for (const item of registered.filter((entry) => entry.projectId === projectId)) {
        const task = await db.generationTasks.get(item.taskId);
        const stale = Date.now() - item.startedAt > 5 * 60 * 1000;
        if ((!task || task.status === "generating") && !stale) continue;
        const images = await Promise.all(
            (task?.images || []).map(async (image): Promise<CanvasNodeImage> => {
                const storedImage = await uploadImage(image.dataUrl);
                return {
                    id: image.id,
                    status: "success",
                    content: storedImage.url,
                    storageKey: storedImage.storageKey,
                    naturalWidth: storedImage.width,
                    naturalHeight: storedImage.height,
                    bytes: storedImage.bytes,
                    mimeType: storedImage.mimeType,
                };
            }),
        );
        results.push({
            taskId: item.taskId,
            prompt: item.prompt,
            projectId: item.projectId,
            nodeId: item.nodeId,
            status: !task || task.status === "generating" ? "failed" : task.status,
            images,
            error: !task || task.status === "generating" ? "Image generation was interrupted" : task.error,
        });
    }
    return results;
}

export function applyRecoveredGenerations(
    nodes: CanvasNodeData[],
    recovered: RecoveredGeneration[],
): CanvasNodeData[] {
    let next = nodes;
    recovered.forEach((result) => {
        const targetIndex = next.findIndex(
            (node) =>
                (node.id === result.nodeId || (!result.nodeId && node.metadata?.prompt === result.prompt)) &&
                (node.metadata?.status === "loading" || node.metadata?.images?.some((image) => image.status === "loading")),
        );
        if (targetIndex < 0) return;
        const target = next[targetIndex]!;
        const metadata = { ...target.metadata };
        if (result.status === "success" && result.images.length > 0) {
            if (metadata.images?.length) {
                let imageIndex = 0;
                metadata.images = metadata.images.map((image) =>
                    image.status === "loading" && result.images[imageIndex]
                        ? result.images[imageIndex++]!
                        : image,
                );
                const primary = metadata.images.find((image) => image.id === metadata.primaryImageId && image.content)
                    || metadata.images.find((image) => image.content);
                if (primary) {
                    metadata.primaryImageId = primary.id;
                    metadata.content = primary.content;
                    metadata.storageKey = primary.storageKey;
                    metadata.naturalWidth = primary.naturalWidth;
                    metadata.naturalHeight = primary.naturalHeight;
                    metadata.bytes = primary.bytes;
                    metadata.mimeType = primary.mimeType;
                }
            } else {
                const image = result.images[0]!;
                const { id, status: _status, ...imageMetadata } = image;
                Object.assign(metadata, imageMetadata, { primaryImageId: id, images: result.images });
            }
            metadata.status = "success";
            metadata.errorDetails = undefined;
        } else {
            metadata.status = "error";
            metadata.errorDetails = result.error || "Image generation failed";
        }
        next = next.map((node, index) => (index === targetIndex ? { ...target, metadata } : node));
    });
    return next;
}
