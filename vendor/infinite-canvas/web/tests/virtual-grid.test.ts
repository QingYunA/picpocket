import { describe, expect, it } from "bun:test";
import { computeGridColumns, computeVirtualWindow } from "../src/integrations/picpocket/virtual-grid";

describe("computeGridColumns", () => {
    it("matches CSS repeat(auto-fill, minmax(80px, 1fr)) with an 8px gap", () => {
        expect(computeGridColumns(80, 80, 8)).toBe(1);
        expect(computeGridColumns(167, 80, 8)).toBe(1);
        expect(computeGridColumns(168, 80, 8)).toBe(2);
        expect(computeGridColumns(344, 80, 8)).toBe(4);
    });

    it("never returns fewer than one column", () => {
        expect(computeGridColumns(0, 80, 8)).toBe(1);
        expect(computeGridColumns(-10, 80, 8)).toBe(1);
    });
});

describe("computeVirtualWindow", () => {
    const base = { itemCount: 100, columns: 4, rowHeight: 100, viewportHeight: 300, overscanRows: 1 };

    it("renders only the rows around the viewport at the top", () => {
        const w = computeVirtualWindow({ ...base, scrollTop: 0 });
        expect(w.startIndex).toBe(0);
        // 3 visible rows + 1 overscan = rows 0..3 → items 0..15
        expect(w.endIndex).toBe(16);
        expect(w.offsetTop).toBe(0);
        expect(w.totalHeight).toBe(25 * 100);
    });

    it("shifts the window and offset when scrolled", () => {
        const w = computeVirtualWindow({ ...base, scrollTop: 1000 });
        // first visible row = 10, minus 1 overscan = 9
        expect(w.startIndex).toBe(36);
        expect(w.offsetTop).toBe(900);
        // last visible row = 12, plus 1 overscan = 13 → items up to 56
        expect(w.endIndex).toBe(56);
    });

    it("clamps the window at the end of the list", () => {
        const w = computeVirtualWindow({ ...base, scrollTop: 99_999 });
        expect(w.endIndex).toBe(100);
        expect(w.startIndex).toBeLessThan(100);
    });

    it("does not count a gap after the last row in the total height", () => {
        const w = computeVirtualWindow({ ...base, scrollTop: 0, trailingGap: 8 });
        expect(w.totalHeight).toBe(25 * 100 - 8);
    });

    it("handles an empty list", () => {
        const w = computeVirtualWindow({ ...base, itemCount: 0, scrollTop: 0 });
        expect(w).toEqual({ startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 });
    });
});
