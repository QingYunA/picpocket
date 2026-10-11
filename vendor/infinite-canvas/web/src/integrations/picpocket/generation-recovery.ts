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

// 由当前页面自己等待结果的任务：后台广播「生成完成」时不要再按「恢复」处理一遍，
// 否则同一任务的图片会被重复入库，还会和正常返回的结果互相覆盖
const liveTaskIds = new Set<string>();

export function setCanvasGenerationLive(taskId: string, live: boolean): void {
    if (live) liveTaskIds.add(taskId);
    else liveTaskIds.delete(taskId);
}

/** 登记超过这个时长的条目视为遗留（页面中途关闭、项目已删除等），写入时顺手清掉，避免登记表无限增长 */
const REGISTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function readRegistry(): Promise<RegisteredGeneration[]> {
    const stored = await chrome.storage.local.get(REGISTRY_KEY);
    return Array.isArray(stored[REGISTRY_KEY]) ? (stored[REGISTRY_KEY] as RegisteredGeneration[]) : [];
}

// 同时生成多张图时登记 / 注销会并发发生；chrome.storage 没有原子读改写，
// 不串行化的话后写入的会用旧快照覆盖先写入的，丢掉登记后该任务就无法在重新打开画布时恢复
let registryWrites: Promise<unknown> = Promise.resolve();

function updateRegistry(mutate: (current: RegisteredGeneration[]) => RegisteredGeneration[]): Promise<void> {
    const run = registryWrites.then(async () => {
        await chrome.storage.local.set({ [REGISTRY_KEY]: mutate(await readRegistry()) });
    });
    registryWrites = run.catch(() => {});
    return run;
}

export async function registerCanvasGeneration(task: RegisteredGeneration): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const now = Date.now();
    await updateRegistry((current) => [
        ...current.filter((item) => item.taskId !== task.taskId && now - item.startedAt < REGISTRY_MAX_AGE_MS),
        task,
    ]);
}

export async function completeCanvasGeneration(taskId: string): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await updateRegistry((current) => current.filter((item) => item.taskId !== taskId));
}

/** 仍在登记表里、该项目下尚未收敛的生成节点；打开画布时其余处于 loading 的节点已无任务可等，需要复位 */
export async function listPendingCanvasNodeIds(projectId: string): Promise<Set<string>> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return new Set();
    const registered = await readRegistry();
    return new Set(registered.filter((item) => item.projectId === projectId && item.nodeId).map((item) => item.nodeId));
}

export async function recoverCanvasGenerations(projectId: string): Promise<RecoveredGeneration[]> {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.local) return [];
    const registered = await readRegistry();
    const results: RecoveredGeneration[] = [];
    const { uploadImage } = await import("@/services/image-storage");
    for (const item of registered.filter((entry) => entry.projectId === projectId && !liveTaskIds.has(entry.taskId))) {
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
