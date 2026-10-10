import { describe, expect, test } from "bun:test";

import { computeRevealViewport, findFreeNodeCenter, layoutNodeRows } from "@/integrations/picpocket/node-placement";

describe("findFreeNodeCenter", () => {
    const size = { width: 340, height: 240 };

    test("keeps the requested center when nothing overlaps", () => {
        expect(findFreeNodeCenter({ x: 0, y: 0 }, size, [])).toEqual({ x: 0, y: 0 });
        expect(findFreeNodeCenter({ x: 0, y: 0 }, size, [{ x: 1000, y: 1000, width: 100, height: 100 }])).toEqual({ x: 0, y: 0 });
    });

    test("moves to the nearest free slot, preferring right then below", () => {
        const occupied = [{ x: -170, y: -120, width: 340, height: 240 }];
        const center = findFreeNodeCenter({ x: 0, y: 0 }, size, occupied);
        expect(center.x).toBeGreaterThan(0);
        const box = { x: center.x - 170, y: center.y - 120, width: 340, height: 240 };
        expect(box.x >= 170 || box.y >= 120 || box.x + box.width <= -170 || box.y + box.height <= -120).toBe(true);
    });

    test("never returns a spot that overlaps an existing node", () => {
        const occupied = Array.from({ length: 5 }, (_, index) => ({ x: -170 + index * 372, y: -120, width: 340, height: 240 }));
        const center = findFreeNodeCenter({ x: 0, y: 0 }, size, occupied);
        const box = { x: center.x - 170, y: center.y - 120, width: 340, height: 240 };
        for (const other of occupied) {
            const overlap = box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y;
            expect(overlap).toBe(false);
        }
    });

    test("falls back to the requested center when the neighbourhood is full", () => {
        const wall = [{ x: -100000, y: -100000, width: 200000, height: 200000 }];
        expect(findFreeNodeCenter({ x: 5, y: 6 }, size, wall)).toEqual({ x: 5, y: 6 });
    });
});

describe("layoutNodeRows", () => {
    test("lays nodes out row by row without overlap, using real sizes", () => {
        const sizes = [
            { width: 640, height: 480 },
            { width: 300, height: 640 },
            { width: 640, height: 360 },
            { width: 200, height: 200 },
        ];
        const { centers, width, height } = layoutNodeRows(sizes, 2, 40);
        expect(centers).toHaveLength(4);
        const boxes = centers.map((center, index) => ({ x: center.x - sizes[index]!.width / 2, y: center.y - sizes[index]!.height / 2, ...sizes[index]! }));
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]!;
                const b = boxes[j]!;
                const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
                expect(overlap).toBe(false);
            }
        }
        expect(width).toBe(640 + 40 + 300);
        expect(height).toBe(640 + 40 + 360);
        expect(Math.min(...boxes.map((box) => box.x))).toBe(0);
        expect(Math.min(...boxes.map((box) => box.y))).toBe(0);
    });

    test("appending a node never moves the ones already placed", () => {
        const sizes = [
            { width: 640, height: 480 },
            { width: 300, height: 640 },
            { width: 640, height: 360 },
            { width: 200, height: 200 },
        ];
        const full = layoutNodeRows(sizes, 2, 40).centers;
        for (let count = 1; count <= sizes.length; count++) {
            expect(layoutNodeRows(sizes.slice(0, count), 2, 40).centers).toEqual(full.slice(0, count));
        }
    });

    test("handles a single node and an empty list", () => {
        expect(layoutNodeRows([{ width: 100, height: 50 }], 3, 20)).toEqual({ centers: [{ x: 50, y: 25 }], width: 100, height: 50 });
        expect(layoutNodeRows([], 3, 20)).toEqual({ centers: [], width: 0, height: 0 });
    });
});

describe("computeRevealViewport", () => {
    const container = { width: 1150, height: 800 };
    const panel = { width: 600, height: 340 };

    test("returns null when the node and its panel are already visible", () => {
        const node = { x: -170, y: -300, width: 340, height: 240 };
        expect(computeRevealViewport({ viewport: { x: 575, y: 400, k: 1 }, container, node, panel })).toBeNull();
    });

    test("pans up so the panel clears the bottom toolbar", () => {
        const node = { x: -170, y: -120, width: 340, height: 240 };
        const next = computeRevealViewport({ viewport: { x: 575, y: 400, k: 1 }, container, node, panel });
        expect(next).not.toBeNull();
        expect(next!.k).toBe(1);
        expect(next!.x).toBe(575);
        const panelBottom = next!.y + (node.y + node.height + 16 + panel.height);
        expect(panelBottom).toBeLessThanOrEqual(container.height - 96);
        expect(next!.y + node.y).toBeGreaterThanOrEqual(64);
    });

    test("zooms out just enough when node and panel are taller than the viewport", () => {
        const node = { x: -320, y: -320, width: 640, height: 480 };
        const next = computeRevealViewport({ viewport: { x: 575, y: 400, k: 1 }, container, node, panel });
        expect(next).not.toBeNull();
        expect(next!.k).toBeLessThan(1);
        expect(next!.k).toBeGreaterThanOrEqual(0.5);
        const top = next!.y + node.y * next!.k;
        const bottom = next!.y + (node.y + node.height + 16 + panel.height) * next!.k;
        expect(top).toBeGreaterThanOrEqual(64 - 0.01);
        expect(bottom).toBeLessThanOrEqual(container.height - 96 + 0.01);
    });

    test("never zooms in, and keeps the node top visible when even the minimum zoom cannot fit", () => {
        const node = { x: -320, y: -320, width: 640, height: 1400 };
        const next = computeRevealViewport({ viewport: { x: 575, y: 400, k: 1 }, container, node, panel });
        expect(next!.k).toBe(0.5);
        expect(next!.y + node.y * next!.k).toBe(64);
        const zoomedOut = computeRevealViewport({ viewport: { x: 575, y: 400, k: 0.2 }, container, node: { x: -170, y: -120, width: 340, height: 240 }, panel });
        expect(zoomedOut === null || zoomedOut.k === 0.2).toBe(true);
    });

    test("accounts for zoom when measuring the panel", () => {
        const node = { x: -170, y: -120, width: 340, height: 240 };
        const next = computeRevealViewport({ viewport: { x: 575, y: 400, k: 0.5 }, container, node, panel });
        expect(next).toBeNull();
    });

    test("pans horizontally when the panel sticks out of the right edge", () => {
        const node = { x: 700, y: -250, width: 340, height: 240 };
        const next = computeRevealViewport({ viewport: { x: 575, y: 400, k: 1 }, container, node, panel });
        expect(next).not.toBeNull();
        const panelRight = next!.x + (node.x + node.width / 2 + panel.width / 2);
        expect(panelRight).toBeLessThanOrEqual(container.width - 16);
    });
});
