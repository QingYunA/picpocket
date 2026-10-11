import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
    completeCanvasGeneration,
    listPendingCanvasNodeIds,
    registerCanvasGeneration,
} from "@/integrations/picpocket/generation-recovery";

const REGISTRY_KEY = "picpocket_canvas_generation_registry_v1";

/** 带延迟的内存版 chrome.storage.local：读和写之间让出事件循环，复现并发读改写的丢更新 */
function installFakeChromeStorage() {
    const data: Record<string, unknown> = {};
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    (globalThis as { chrome?: unknown }).chrome = {
        storage: {
            local: {
                async get(key: string) {
                    await tick();
                    return key in data ? { [key]: structuredClone(data[key]) } : {};
                },
                async set(values: Record<string, unknown>) {
                    await tick();
                    Object.assign(data, structuredClone(values));
                },
            },
        },
    };
    return data;
}

const task = (taskId: string, extra: Partial<{ projectId: string; nodeId: string; startedAt: number }> = {}) => ({
    taskId,
    prompt: "prompt",
    startedAt: Date.now(),
    projectId: "p1",
    nodeId: `node-${taskId}`,
    ...extra,
});

describe("generation registry", () => {
    let data: Record<string, unknown>;
    beforeEach(() => {
        data = installFakeChromeStorage();
    });
    afterEach(() => {
        delete (globalThis as { chrome?: unknown }).chrome;
    });

    test("concurrent registrations do not overwrite each other", async () => {
        await Promise.all([registerCanvasGeneration(task("a")), registerCanvasGeneration(task("b")), registerCanvasGeneration(task("c"))]);
        const ids = (data[REGISTRY_KEY] as Array<{ taskId: string }>).map((item) => item.taskId).sort();
        expect(ids).toEqual(["a", "b", "c"]);
    });

    test("concurrent register and complete both take effect", async () => {
        await registerCanvasGeneration(task("a"));
        await Promise.all([completeCanvasGeneration("a"), registerCanvasGeneration(task("b"))]);
        const ids = (data[REGISTRY_KEY] as Array<{ taskId: string }>).map((item) => item.taskId);
        expect(ids).toEqual(["b"]);
    });

    test("drops entries older than a day when registering a new one", async () => {
        await registerCanvasGeneration(task("old", { startedAt: Date.now() - 25 * 60 * 60 * 1000 }));
        await registerCanvasGeneration(task("fresh"));
        const ids = (data[REGISTRY_KEY] as Array<{ taskId: string }>).map((item) => item.taskId);
        expect(ids).toEqual(["fresh"]);
    });

    test("lists pending node ids only for the requested project", async () => {
        await registerCanvasGeneration(task("a", { projectId: "p1", nodeId: "n1" }));
        await registerCanvasGeneration(task("b", { projectId: "p2", nodeId: "n2" }));
        await registerCanvasGeneration(task("c", { projectId: "p1", nodeId: "" }));
        expect(await listPendingCanvasNodeIds("p1")).toEqual(new Set(["n1"]));
    });
});
