import { describe, expect, test } from "bun:test";

import { hostedCanvasSelection } from "@/integrations/picpocket/hosted-credits";
import { PICPOCKET_MANAGED_KEY } from "@/integrations/picpocket/picpocket-config-model";

const channels = [
    { id: "picpocket-image-picpocket", apiKey: PICPOCKET_MANAGED_KEY },
    { id: "picpocket-image-own", apiKey: "sk-own" },
    { id: "picpocket-vision", apiKey: PICPOCKET_MANAGED_KEY },
];

describe("hostedCanvasSelection", () => {
    test("recognizes the PicPocket image channel and returns the model", () => {
        expect(hostedCanvasSelection("image", "picpocket-image-picpocket::gpt-image-2.5-sunburst", channels)).toEqual({ kind: "image", model: "gpt-image-2.5-sunburst" });
    });

    test("ignores the user's own image channels", () => {
        expect(hostedCanvasSelection("image", "picpocket-image-own::dall-e-3", channels)).toBeNull();
    });

    test("recognizes hosted text (vision) only while the vision channel is managed by PicPocket", () => {
        expect(hostedCanvasSelection("text", "picpocket-vision::deepseek-flash", channels)).toEqual({ kind: "vision", model: "deepseek-flash" });
        const own = [{ id: "picpocket-vision", apiKey: "sk-vision" }];
        expect(hostedCanvasSelection("text", "picpocket-vision::deepseek-flash", own)).toBeNull();
    });

    test("does not mix capabilities: an image model in text mode is not hosted vision", () => {
        expect(hostedCanvasSelection("text", "picpocket-image-picpocket::gpt-image-2.5-sunburst", channels)).toBeNull();
        expect(hostedCanvasSelection("image", "picpocket-vision::deepseek-flash", channels)).toBeNull();
    });

    test("returns null for video/audio, empty or malformed values", () => {
        expect(hostedCanvasSelection("video", "picpocket-image-picpocket::x", channels)).toBeNull();
        expect(hostedCanvasSelection("image", "", channels)).toBeNull();
        expect(hostedCanvasSelection("image", undefined, channels)).toBeNull();
        expect(hostedCanvasSelection("image", "no-separator", channels)).toBeNull();
        expect(hostedCanvasSelection("text", "picpocket-vision::deepseek-flash", undefined)).toBeNull();
    });
});
