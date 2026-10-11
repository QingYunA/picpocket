import { describe, expect, test } from "bun:test";

import { wheelZoomFactor } from "@/integrations/picpocket/wheel-zoom";

describe("wheelZoomFactor", () => {
    test("keeps the mouse wheel step: one notch is about 10%", () => {
        expect(wheelZoomFactor(-100, false)).toBeCloseTo(1.1, 5);
        expect(wheelZoomFactor(100, false)).toBeCloseTo(1 / 1.1, 5);
    });

    test("small pinch deltas still zoom noticeably", () => {
        expect(wheelZoomFactor(-5, true)).toBeGreaterThan(1.04);
        expect(wheelZoomFactor(5, true)).toBeLessThan(0.96);
    });

    test("zoom in and out are symmetric", () => {
        expect(wheelZoomFactor(-7, true) * wheelZoomFactor(7, true)).toBeCloseTo(1, 10);
    });

    test("a large pinch delta is capped per event", () => {
        expect(wheelZoomFactor(-45, true)).toBeCloseTo(Math.exp(0.4), 10);
        expect(wheelZoomFactor(45, true)).toBeCloseTo(Math.exp(-0.4), 10);
    });

    test("Ctrl + mouse wheel keeps the 10% notch instead of the pinch curve", () => {
        expect(wheelZoomFactor(-100, true)).toBeCloseTo(1.1, 5);
        expect(wheelZoomFactor(100, true)).toBeCloseTo(1 / 1.1, 5);
    });
});
