import { describe, expect, test } from "bun:test";

import { closestAspectRatio } from "@/integrations/picpocket/pocket-adapter";

describe("closestAspectRatio", () => {
    test("maps common landscape, portrait, and square dimensions", () => {
        expect(closestAspectRatio(1920, 1080)).toBe("16:9");
        expect(closestAspectRatio(1080, 1920)).toBe("9:16");
        expect(closestAspectRatio(1024, 1024)).toBe("1:1");
    });

    test("uses a safe square fallback for invalid dimensions", () => {
        expect(closestAspectRatio(0, 0)).toBe("1:1");
    });
});
