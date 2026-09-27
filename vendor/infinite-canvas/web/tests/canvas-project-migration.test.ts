import { describe, expect, test } from "bun:test";

import { commitMigratedProjects, migrateLegacyCanvasProjects } from "@/integrations/picpocket/canvas-project-migration";
import { applyRecoveredGenerations } from "@/integrations/picpocket/generation-recovery";
import { CanvasNodeType } from "@/types/canvas";

describe("migrateLegacyCanvasProjects", () => {
    test("converts image cards and notes while preserving the old project identity", async () => {
        const projects = await migrateLegacyCanvasProjects(
            [{
                id: "legacy-1", title: "Campaign", createdAt: 100, updatedAt: 200,
                cards: [{
                    id: "image-1",
                    image: { id: "generated-1", dataUrl: "data:image/png;base64,AA==", prompt: "red poster", aspectRatio: "1:1", width: 100, height: 100, createdAt: 100 },
                }],
                cardPositions: { "image-1": { x: 12, y: 34 } },
                textNotes: [{ id: "note-1", text: "headline", x: 20, y: 30, createdAt: 100 }],
                viewport: { x: 5, y: 6, k: 1.2 },
            }],
            [],
            async () => ({ url: "blob:migrated", storageKey: "image:migrated", width: 100, height: 100, bytes: 2, mimeType: "image/png" }),
        );

        expect(projects[0]?.id).toBe("picpocket-legacy-1");
        expect(projects[0]?.nodes).toHaveLength(2);
        expect(projects[0]?.nodes[0]?.metadata?.storageKey).toBe("image:migrated");
        expect(projects[0]?.viewport).toEqual({ x: 5, y: 6, k: 1.2 });
    });

    test("does not import an already migrated project twice", async () => {
        const existing = {
            id: "picpocket-legacy-1", title: "Existing", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
            nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines" as const, showImageInfo: false, viewport: { x: 0, y: 0, k: 1 },
        };
        const projects = await migrateLegacyCanvasProjects(
            [{ id: "legacy-1", title: "Legacy", createdAt: 0, updatedAt: 0, cards: [], cardPositions: {}, textNotes: [] }],
            [existing],
            async () => { throw new Error("should not write images"); },
        );
        expect(projects).toEqual([existing]);
    });
});

describe("applyRecoveredGenerations", () => {
    test("replaces a loading node with the persisted background result", () => {
        const nodes = applyRecoveredGenerations(
            [{
                id: "node-1",
                type: CanvasNodeType.Image,
                title: "Draft",
                position: { x: 0, y: 0 },
                width: 340,
                height: 240,
                metadata: { prompt: "red poster", status: "loading" },
            }],
            [{
                taskId: "task-1",
                prompt: "red poster",
                projectId: "project-1",
                nodeId: "node-1",
                status: "success",
                images: [{
                    id: "image-1",
                    status: "success",
                    content: "blob:result",
                    storageKey: "image:result",
                    naturalWidth: 1024,
                    naturalHeight: 1024,
                    bytes: 10,
                    mimeType: "image/png",
                }],
            }],
        );
        expect(nodes[0]?.metadata?.status).toBe("success");
        expect(nodes[0]?.metadata?.storageKey).toBe("image:result");
    });

    test("restores the primary image fields of an existing batch node", () => {
        const nodes = applyRecoveredGenerations(
            [{
                id: "batch", type: CanvasNodeType.Image, title: "Generated", position: { x: 0, y: 0 }, width: 340, height: 240,
                metadata: {
                    status: "loading", primaryImageId: "pending", images: [
                        { id: "pending", status: "loading", content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" },
                    ],
                },
            }],
            [{
                taskId: "task-1", prompt: "poster", projectId: "project-1", nodeId: "batch", status: "success",
                images: [{ id: "generated", status: "success", content: "blob:generated", storageKey: "image:generated", naturalWidth: 1024, naturalHeight: 1024, bytes: 10, mimeType: "image/png" }],
            }],
        );
        expect(nodes[0]?.metadata).toMatchObject({ content: "blob:generated", storageKey: "image:generated", primaryImageId: "generated" });
    });
});

describe("commitMigratedProjects", () => {
    test("marks completion only after persistence succeeds", async () => {
        const events: string[] = [];
        await commitMigratedProjects({
            replace: () => events.push("replace"),
            persist: async () => { events.push("persist"); },
            markComplete: async () => { events.push("mark"); },
        });
        expect(events).toEqual(["replace", "persist", "mark"]);
    });

    test("does not mark completion when persistence fails", async () => {
        let marked = false;
        await expect(commitMigratedProjects({
            replace: () => {},
            persist: async () => { throw new Error("quota"); },
            markComplete: async () => { marked = true; },
        })).rejects.toThrow("quota");
        expect(marked).toBe(false);
    });
});
