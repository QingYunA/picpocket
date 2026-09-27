import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";

export function primaryCanvasImage(node: CanvasNodeData): { content: string; storageKey?: string; mimeType: string } | null {
    if (node.type !== CanvasNodeType.Image) return null;
    const metadata = node.metadata;
    const primary = metadata?.images?.find((image) => image.id === metadata.primaryImageId && image.content)
        || metadata?.images?.find((image) => image.content);
    const content = primary?.content || metadata?.content;
    if (!content) return null;
    return {
        content,
        storageKey: primary?.storageKey || metadata?.storageKey,
        mimeType: primary?.mimeType || metadata?.mimeType || "image/png",
    };
}

export function canvasImageReference(node: CanvasNodeData): ReferenceImage | null {
    const image = primaryCanvasImage(node);
    return image ? {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: image.mimeType,
        dataUrl: image.content,
        storageKey: image.storageKey,
    } : null;
}
