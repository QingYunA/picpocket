import { describe, expect, test } from "bun:test";

import { canvasImageReference, primaryCanvasImage } from "@/lib/canvas/canvas-image-source";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

describe("primaryCanvasImage", () => {
    test("uses the visible primary image of a batch when top-level content is empty", () => {
        const node: CanvasNodeData = {
            id: "batch", type: CanvasNodeType.Image, title: "Generated", position: { x: 0, y: 0 }, width: 400, height: 300,
            metadata: {
                status: "success", primaryImageId: "second", images: [
                    { id: "first", status: "success", content: "blob:first", storageKey: "image:first", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                    { id: "second", status: "success", content: "blob:second", storageKey: "image:second", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                ],
            },
        };
        expect(primaryCanvasImage(node)).toEqual({ content: "blob:second", storageKey: "image:second", mimeType: "image/png" });
        expect(canvasImageReference(node)).toMatchObject({ dataUrl: "blob:second", storageKey: "image:second" });
    });

    test("passes a generated batch primary image into a derived node's generation context", async () => {
        const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => {} } });
        try {
            const { buildNodeGenerationContext } = await import("@/components/canvas/canvas-node-generation");
            const source: CanvasNodeData = {
                id: "source", type: CanvasNodeType.Image, title: "Generated", position: { x: 0, y: 0 }, width: 400, height: 300,
                metadata: {
                    status: "success", primaryImageId: "image-2", images: [
                        { id: "image-1", status: "success", content: "blob:first", storageKey: "image:first", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                        { id: "image-2", status: "success", content: "blob:second", storageKey: "image:second", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                    ],
                },
            };
            const child: CanvasNodeData = { id: "child", type: CanvasNodeType.Image, title: "Child", position: { x: 500, y: 0 }, width: 400, height: 300, metadata: {} };
            const context = buildNodeGenerationContext("child", [source, child], [{ id: "connection", fromNodeId: "source", toNodeId: "child" }], "Change the background");
            expect(context.referenceImages).toEqual([expect.objectContaining({ dataUrl: "blob:second", storageKey: "image:second" })]);
        } finally {
            if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
            else Reflect.deleteProperty(globalThis, "localStorage");
        }
    });
});
