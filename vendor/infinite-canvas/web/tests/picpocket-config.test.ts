import { describe, expect, test } from "bun:test";

import {
    buildPicPocketCanvasConfig,
    isPicPocketCanvasNodeTypeSupported,
    isPicPocketModelCapabilitySupported,
    picPocketModelSettingsRoute,
} from "@/integrations/picpocket/picpocket-config-model";
import { resolveCanvasImageSelection } from "@/integrations/picpocket/image-model-selection";

describe("buildPicPocketCanvasConfig", () => {
    test("uses PicPocket as the only model configuration source", () => {
        const patch = buildPicPocketCanvasConfig({
            apiKey: "vision-key",
            baseUrl: "https://vision.example/v1",
            model: "vision-model",
            imageApiKey: "image-key",
            imageBaseUrl: "https://image.example/v1",
            imageModel: "image-model",
            language: "zh",
            autoAnalyzeOnCapture: false,
            enableHoverBadge: true,
            hoverBadgePromptDismissed: true,
            contextMenuMode: "direct-analyze",
        });

        expect(patch.channels).toEqual([
            expect.objectContaining({
                id: "picpocket-image",
                baseUrl: "https://image.example/v1",
                apiKey: "image-key",
                models: [{ name: "image-model", capability: "image" }],
            }),
            expect.objectContaining({
                id: "picpocket-vision",
                baseUrl: "https://vision.example/v1",
                apiKey: "vision-key",
                models: [{ name: "vision-model", capability: "text" }],
            }),
        ]);
        expect(patch.imageModel).toBe("picpocket-image::image-model");
        expect(patch.textModel).toBe("picpocket-vision::vision-model");
    });

    test("exposes every enabled image model from configured channels", () => {
        const patch = buildPicPocketCanvasConfig({
            apiKey: "vision-key", baseUrl: "https://vision.example/v1", model: "vision-model",
            imageApiKey: "key-a", imageBaseUrl: "https://a.example/v1", imageModel: "model-a2",
            imageChannels: [
                { id: "a", name: "Channel A", providerId: "custom", apiKey: "key-a", baseUrl: "https://a.example/v1", model: "model-a2", models: ["model-a1", "model-a2"] },
                { id: "b", name: "Channel B", providerId: "custom", apiKey: "key-b", baseUrl: "https://b.example/v1", model: "model-b", models: ["model-b"] },
            ],
            activeImageChannelId: "a", language: "zh", autoAnalyzeOnCapture: false,
        });

        expect(patch.channels).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "picpocket-image-a", models: [{ name: "model-a1", capability: "image" }, { name: "model-a2", capability: "image" }] }),
            expect.objectContaining({ id: "picpocket-image-b", baseUrl: "https://b.example/v1", apiKey: "key-b", models: [{ name: "model-b", capability: "image" }] }),
        ]));
        expect(patch.imageModel).toBe("picpocket-image-a::model-a2");
    });

    test("retains the legacy canvas channel ID after settings migration", () => {
        const patch = buildPicPocketCanvasConfig({
            apiKey: "vision-key", baseUrl: "https://vision.example/v1", model: "vision-model",
            imageApiKey: "image-key", imageBaseUrl: "https://image.example/v1", imageModel: "image-model",
            imageChannels: [{ id: "legacy-image", name: "Legacy", providerId: "custom", apiKey: "image-key", baseUrl: "https://image.example/v1", model: "image-model", models: ["image-model"] }],
            activeImageChannelId: "legacy-image", language: "zh", autoAnalyzeOnCapture: false,
        });
        expect(patch.imageModel).toBe("picpocket-image::image-model");
    });
});

test("routes image and text configuration to PicPocket settings", () => {
    expect(picPocketModelSettingsRoute("image")).toBe("/models/image");
    expect(picPocketModelSettingsRoute("text")).toBe("/models/vision");
    expect(picPocketModelSettingsRoute("video")).toBeNull();
    expect(picPocketModelSettingsRoute("audio")).toBeNull();
});

test("exposes only model and node capabilities configured by PicPocket", () => {
    expect(isPicPocketModelCapabilitySupported("image")).toBe(true);
    expect(isPicPocketModelCapabilitySupported("text")).toBe(true);
    expect(isPicPocketModelCapabilitySupported("video")).toBe(false);
    expect(isPicPocketModelCapabilitySupported("audio")).toBe(false);
    expect(isPicPocketCanvasNodeTypeSupported("image")).toBe(true);
    expect(isPicPocketCanvasNodeTypeSupported("text")).toBe(true);
    expect(isPicPocketCanvasNodeTypeSupported("config")).toBe(true);
    expect(isPicPocketCanvasNodeTypeSupported("group")).toBe(true);
    expect(isPicPocketCanvasNodeTypeSupported("video")).toBe(false);
    expect(isPicPocketCanvasNodeTypeSupported("audio")).toBe(false);
});

test("routes canvas node and image page selections independently", () => {
    const settings = {
        apiKey: "vision-key", baseUrl: "https://vision.example/v1", model: "vision-model",
        imageModel: "model-a", imageChannels: [
            { id: "a", name: "A", providerId: "custom", apiKey: "a-key", baseUrl: "https://a.example/v1", model: "model-a", models: ["model-a"] },
            { id: "b", name: "B", providerId: "custom", apiKey: "b-key", baseUrl: "https://b.example/v1", model: "model-b", models: ["model-b"] },
        ],
        activeImageChannelId: "a", language: "zh" as const, autoAnalyzeOnCapture: false,
    };
    const config = { model: "picpocket-image-b::model-b", imageModel: "picpocket-image-a::model-a" };
    expect(resolveCanvasImageSelection(settings, config)).toEqual({ model: "model-b", channelId: "b" });
    expect(resolveCanvasImageSelection(settings, config, config.imageModel)).toEqual({ model: "model-a", channelId: "a" });
    expect(resolveCanvasImageSelection(settings, { ...config, model: "model-b" })).toEqual({ model: "model-b", channelId: "b" });
});
