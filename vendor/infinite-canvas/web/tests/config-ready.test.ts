import { describe, expect, test } from "bun:test";

import { isModelChannelReady } from "@/integrations/picpocket/channel-ready";
import { PICPOCKET_MANAGED_KEY } from "@/integrations/picpocket/picpocket-config-model";

describe("isModelChannelReady", () => {
    test("treats the PicPocket-managed channel as ready even though it has no baseUrl", () => {
        expect(isModelChannelReady("gpt-image-2.5-sunburst", { baseUrl: "", apiKey: PICPOCKET_MANAGED_KEY })).toBe(true);
    });

    test("still requires a baseUrl for the user's own channels", () => {
        expect(isModelChannelReady("dall-e-3", { baseUrl: "", apiKey: "sk-own" })).toBe(false);
        expect(isModelChannelReady("dall-e-3", { baseUrl: "   ", apiKey: "sk-own" })).toBe(false);
    });

    test("still requires a key and a model name", () => {
        expect(isModelChannelReady("dall-e-3", { baseUrl: "https://api.example.com/v1", apiKey: "" })).toBe(false);
        expect(isModelChannelReady("", { baseUrl: "https://api.example.com/v1", apiKey: "sk-own" })).toBe(false);
        expect(isModelChannelReady("", { baseUrl: "", apiKey: PICPOCKET_MANAGED_KEY })).toBe(false);
    });

    test("a complete own channel is ready", () => {
        expect(isModelChannelReady("dall-e-3", { baseUrl: "https://api.example.com/v1", apiKey: "sk-own" })).toBe(true);
    });
});
