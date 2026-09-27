import {
    batchDeleteItems,
    batchMoveItemsToFolder,
    createFolder,
    db,
    deleteFolder,
    moveItemToFolder,
    renameFolder,
    saveGeneratedImageToGallery,
} from "@picpocket/db";
import { readFileAsDataUrl } from "@picpocket/utils/file";
import { createZipArchive, downloadBlobOrUrl, type ZipEntry } from "@picpocket/services/storageBackup";
import type { FolderItem, GeneratedImage, ImageAspectRatio, InspirationItem } from "@picpocket/types";

export type PocketCanvasAsset = {
    id: number;
    title: string;
    dataUrl: string;
    width: number;
    height: number;
    folderId: number | null;
    prompt: string;
    tags: string[];
};

export type PocketFolder = {
    id: number;
    name: string;
    parentId: number | null;
    order: number;
};

export type PocketAssetSummary = {
    id: number;
    title: string;
    previewDataUrl: string;
    folderId: number | null;
    tags: string[];
};

export type SaveCanvasImageInput = {
    dataUrl: string;
    title?: string;
    prompt?: string;
    model?: string;
    width: number;
    height: number;
    folderId: number | null;
};

export async function resolvePocketCanvasAsset(itemId: number): Promise<PocketCanvasAsset | null> {
    const [item, prompt] = await Promise.all([
        db.items.get(itemId),
        db.prompts.where("itemId").equals(itemId).first(),
    ]);
    if (!item) return null;

    return mapPocketItem(item, await readFileAsDataUrl(item.originalBlob), prompt?.masterPrompt || "");
}

export async function listPocketFolders(): Promise<PocketFolder[]> {
    const folders = await db.folders.orderBy("order").toArray();
    return folders.flatMap((folder) =>
        typeof folder.id === "number"
            ? [{ id: folder.id, name: folder.name, parentId: folder.parentId ?? null, order: folder.order || 0 }]
            : [],
    );
}

export async function listPocketItems(): Promise<InspirationItem[]> {
    return db.items.orderBy("createdAt").reverse().toArray();
}

/**
 * 预览 DataURL 缓存：useLiveQuery 在 items 表任意变动时都会重跑查询，
 * 若每次都对全部缩略图重新 Base64 编码，资产量大时移动/删除单张也会明显卡顿。
 * 以「id + blob 大小/类型」为签名复用已编码结果，只处理新增或变化的条目。
 * 已知局限：同一 id 被替换为大小与类型完全相同的新图时不会刷新（素材入库后图片内容不再改写，可接受）。
 */
const previewCache = new Map<number, { signature: string; dataUrl: string }>();

async function getCachedPreviewDataUrl(id: number, blob: Blob): Promise<string> {
    const signature = `${blob.size}:${blob.type}`;
    const cached = previewCache.get(id);
    if (cached?.signature === signature) return cached.dataUrl;
    const dataUrl = await readFileAsDataUrl(blob);
    previewCache.set(id, { signature, dataUrl });
    return dataUrl;
}

export async function listPocketAssetSummaries(): Promise<PocketAssetSummary[]> {
    const items = await listPocketItems();
    const liveIds = new Set<number>();
    const summaries = await Promise.all(
        items.flatMap((item) => {
            if (typeof item.id !== "number") return [];
            const id = item.id;
            liveIds.add(id);
            return [
                getCachedPreviewDataUrl(id, item.thumbnailBlob || item.originalBlob).then((previewDataUrl) => ({
                    id,
                    title: item.pageTitle || "Untitled",
                    previewDataUrl,
                    folderId: item.folderId ?? null,
                    tags: item.tags || [],
                })),
            ];
        }),
    );
    for (const id of previewCache.keys()) {
        if (!liveIds.has(id)) previewCache.delete(id);
    }
    return summaries;
}

export async function saveCanvasImageToPocket(input: SaveCanvasImageInput): Promise<number> {
    const image: GeneratedImage = {
        id: `canvas-${Date.now()}`,
        dataUrl: input.dataUrl,
        prompt: input.prompt || input.title || "",
        model: input.model,
        aspectRatio: closestAspectRatio(input.width, input.height),
        width: input.width,
        height: input.height,
        createdAt: Date.now(),
    };
    return saveGeneratedImageToGallery(image, input.title, input.folderId);
}

export async function saveCanvasBlobToPocket(
    blob: Blob,
    input: Omit<SaveCanvasImageInput, "dataUrl">,
): Promise<number> {
    return saveCanvasImageToPocket({ ...input, dataUrl: await readFileAsDataUrl(blob) });
}

export async function saveReversePromptToPocket(
    itemId: number,
    masterPrompt: string,
    model: string,
): Promise<void> {
    const existing = await db.prompts.where("itemId").equals(itemId).first();
    const record = {
        itemId,
        model,
        subject: existing?.subject || [],
        style: existing?.style || [],
        lighting: existing?.lighting || [],
        composition: existing?.composition || [],
        masterPrompt,
        textSlots: existing?.textSlots,
        templatePrompt: existing?.templatePrompt,
        createdAt: Date.now(),
        isOriginalPrompt: false,
    };
    if (existing?.id) {
        await db.prompts.put({ ...record, id: existing.id });
    } else {
        await db.prompts.add(record);
    }
    await db.items.update(itemId, { status: "analyzed" });
}

export function closestAspectRatio(width: number, height: number): ImageAspectRatio {
    if (width <= 0 || height <= 0) return "1:1";
    const ratio = width / height;
    const candidates: Array<[ImageAspectRatio, number]> = [
        ["1:1", 1],
        ["16:9", 16 / 9],
        ["9:16", 9 / 16],
        ["4:3", 4 / 3],
        ["3:4", 3 / 4],
        ["21:9", 21 / 9],
        ["2:3", 2 / 3],
    ];
    return candidates.reduce((best, candidate) =>
        Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio) ? candidate : best,
    )[0];
}

function mapPocketItem(item: InspirationItem, dataUrl: string, prompt: string): PocketCanvasAsset {
    if (typeof item.id !== "number") throw new Error("Pocket asset must have an ID");
    return {
        id: item.id,
        title: item.pageTitle || "Untitled",
        dataUrl,
        width: item.width || 1024,
        height: item.height || 1024,
        folderId: item.folderId ?? null,
        prompt,
        tags: item.tags || [],
    };
}

export async function deletePocketItem(itemId: number): Promise<void> {
    await batchDeleteItems([itemId]);
}

export async function movePocketItem(itemId: number, folderId: number | null): Promise<void> {
    await moveItemToFolder(itemId, folderId);
}

export async function getPocketAssetPrompt(itemId: number): Promise<string> {
    const prompt = await db.prompts.where("itemId").equals(itemId).first();
    return prompt?.masterPrompt || "";
}

export async function createPocketFolder(name: string, parentId: number | null = null): Promise<number> {
    return createFolder(name, parentId);
}

export async function renamePocketFolder(id: number, newName: string): Promise<void> {
    await renameFolder(id, newName);
}

export async function deletePocketFolder(id: number): Promise<void> {
    await deleteFolder(id);
}

export async function batchDeletePocketItems(itemIds: number[]): Promise<void> {
    if (!itemIds.length) return;
    await batchDeleteItems(itemIds);
}

export async function batchMovePocketItems(itemIds: number[], folderId: number | null): Promise<void> {
    if (!itemIds.length) return;
    await batchMoveItemsToFolder(itemIds, folderId);
}

export const PICPOCKET_DRAG_TYPE_ASSET = "application/x-picpocket-asset";
export const PICPOCKET_DRAG_TYPE_ASSETS = "application/x-picpocket-assets";

const MIME_EXTENSIONS: Record<string, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "image/avif": ["avif"],
    "image/bmp": ["bmp"],
    "image/svg+xml": ["svg"],
};

/** 文件名主体上限，预留扩展名与去重后缀空间，避免超出常见文件系统 255 字节限制 */
const MAX_FILENAME_BASE_LENGTH = 110;

function splitExtension(name: string): { base: string; ext: string } {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: "" };
}

/**
 * 格式化安全的文件名（过滤非法字符、截断超长标题，并按图片 MIME 补全正确扩展名，未知类型回退 .png）
 */
export function sanitizeAssetFilename(
    rawTitle: string | undefined | null,
    defaultFallback: string = "asset",
    mimeType?: string,
): string {
    const fallback = defaultFallback.trim() || "asset";
    const cleaned = (rawTitle || "").replace(/[/\\?%*:|"<>]/g, "_").trim() || fallback;
    const extensions = MIME_EXTENSIONS[(mimeType || "").toLowerCase()] ?? ["png"];
    const { base, ext } = splitExtension(cleaned);
    const hasMatchingExt = extensions.includes(ext.slice(1).toLowerCase());
    const stem = (hasMatchingExt ? base : cleaned).slice(0, MAX_FILENAME_BASE_LENGTH);
    return `${stem}${hasMatchingExt ? ext : `.${extensions[0]}`}`;
}

/**
 * 为 ZIP 条目生成唯一文件名；按不区分大小写去重，避免在 macOS / Windows 解压时互相覆盖
 */
export function uniqueArchiveName(name: string, usedLowerNames: Set<string>): string {
    let candidate = name;
    const { base, ext } = splitExtension(name);
    let counter = 1;
    while (usedLowerNames.has(candidate.toLowerCase())) {
        candidate = `${base}_${counter}${ext}`;
        counter++;
    }
    usedLowerNames.add(candidate.toLowerCase());
    return candidate;
}

/**
 * 将多选集合收窄到当前可见列表，防止被搜索/筛选隐藏的资产仍参与批量删除或移动
 */
export function pruneSelectionToVisible(selected: Set<number>, visible: Array<{ id: number }>): Set<number> {
    if (!selected.size) return selected;
    const visibleIds = new Set(visible.map((item) => item.id));
    const next = new Set(Array.from(selected).filter((id) => visibleIds.has(id)));
    return next.size === selected.size ? selected : next;
}

/**
 * 计算基于起始索引与结束索引的连续选区 ID 集合
 */
export function computeRangeSelection<T extends { id: number }>(
    items: T[],
    startIndex: number,
    endIndex: number,
    existingSelectedIds: Iterable<number> = [],
): Set<number> {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const next = new Set(existingSelectedIds);
    for (let i = Math.max(0, start); i <= Math.min(items.length - 1, end); i++) {
        next.add(items[i].id);
    }
    return next;
}

export async function downloadPocketAssets(itemIds: number[]): Promise<void> {
    if (!itemIds.length) return;

    if (itemIds.length === 1) {
        const item = await db.items.get(itemIds[0]);
        if (!item?.originalBlob) return;
        const filename = sanitizeAssetFilename(item.pageTitle, "asset", item.originalBlob.type);
        downloadBlobOrUrl(item.originalBlob, filename);
        return;
    }

    const entries: ZipEntry[] = [];
    const usedNames = new Set<string>();

    for (const id of itemIds) {
        const item = await db.items.get(id);
        if (!item?.originalBlob) continue;
        const finalName = uniqueArchiveName(
            sanitizeAssetFilename(item.pageTitle, `asset_${id}`, item.originalBlob.type),
            usedNames,
        );

        const arrayBuffer = await item.originalBlob.arrayBuffer();
        entries.push({
            name: finalName,
            data: new Uint8Array(arrayBuffer),
        });
    }

    if (!entries.length) return;
    const zipBlob = createZipArchive(entries);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `PicPocket_Assets_${entries.length}_${dateStr}.zip`;
    downloadBlobOrUrl(zipBlob, filename);
}

export { getActiveFolder, setActiveFolder, onActiveFolderChange, type ActiveFolderState } from '@picpocket/utils/storage';

