import { nanoid } from "nanoid";

import { addGenerationTask, db } from "@picpocket/db";
import { getUserSettings } from "@picpocket/utils/storage";
import type { ImageAspectRatio, ImageGenerationParams } from "@picpocket/types";
import { readFileAsDataUrl } from "@picpocket/utils/file";

import type { AiConfig, ModelChannel } from "@/stores/use-config-store";
import { resolveCanvasImageSelection } from "@/integrations/picpocket/image-model-selection";
import type { ReferenceImage } from "@/types/image";
import { getImageBlob } from "@/services/image-storage";
import { completeCanvasGeneration, registerCanvasGeneration } from "@/integrations/picpocket/generation-recovery";
import {
    fetchChannelModels,
    fetchImageModels,
} from "./image";

type RequestOptions = { signal?: AbortSignal; canvasProjectId?: string; canvasNodeId?: string; selectedModel?: string };

export { fetchChannelModels, fetchImageModels };

type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export async function requestImageQuestion(
    config: AiConfig,
    messages: AiTextMessage[],
    onDelta: (text: string) => void,
    options?: RequestOptions,
): Promise<string> {
    const requestId = `canvas_text_${Date.now()}_${nanoid(6)}`;
    const preparedMessages = await Promise.all(
        messages.map(async (message) => ({
            ...message,
            content: typeof message.content === "string"
                ? message.content
                : await Promise.all(
                      message.content.map(async (part) => {
                          if (part.type !== "image_url" || !part.image_url.url.startsWith("blob:")) return part;
                          const response = await fetch(part.image_url.url);
                          return {
                              ...part,
                              image_url: { url: await readFileAsDataUrl(await response.blob()) },
                          };
                      }),
                  ),
        })),
    );
    const abort = () => {
        chrome.runtime.sendMessage({ action: "CANCEL_CANVAS_TEXT_GENERATION", requestId }).catch(() => {});
    };
    options?.signal?.addEventListener("abort", abort, { once: true });
    try {
        const response = await chrome.runtime.sendMessage({
            action: "START_CANVAS_TEXT_GENERATION",
            requestId,
            messages: preparedMessages,
            model: rawModelName(config.textModel || config.model),
        });
        if (!response?.success) throw new Error(response?.error || "Text generation failed");
        const text = String(response.text || "");
        onDelta(text);
        return text;
    } finally {
        options?.signal?.removeEventListener("abort", abort);
    }
}

function rawModelName(value: string): string {
    return value.includes("::") ? value.slice(value.indexOf("::") + 2) : value;
}

export async function requestGeneration(
    config: AiConfig,
    prompt: string,
    options?: RequestOptions,
) {
    return requestPicPocketImages(config, prompt, [], options);
}

export async function requestEdit(
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[],
    options?: RequestOptions,
) {
    return requestPicPocketImages(config, prompt, references, options);
}

async function requestPicPocketImages(
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[],
    options?: RequestOptions,
) {
    const settings = await getUserSettings();
    const { model, channelId } = resolveCanvasImageSelection(settings, config, options?.selectedModel);
    const aspectRatio = normalizeAspectRatio(config.size);
    const count = Math.max(1, Math.min(4, Number(config.count) || 1));
    const referenceImages = await Promise.all(references.map(resolveReferenceDataUrl));
    const taskId = `task_canvas_${Date.now()}_${nanoid(6)}`;
    const startTime = Date.now();
    const params: ImageGenerationParams = {
        prompt,
        model,
        channelId,
        aspectRatio,
        count,
        quality: normalizeQuality(config.quality),
        referenceImages,
        sendAsReferenceImage: referenceImages.length > 0,
        transparent: config.background === "transparent",
    };

    await addGenerationTask({
        id: taskId,
        prompt,
        aspectRatio,
        model,
        images: [],
        status: "generating",
        createdAt: startTime,
    });
    await registerCanvasGeneration({
        taskId,
        prompt,
        startedAt: startTime,
        projectId: options?.canvasProjectId || "",
        nodeId: options?.canvasNodeId || "",
    });

    const abort = () => {
        chrome.runtime.sendMessage({ action: "CANCEL_IMAGE_GENERATION", taskId }).catch(() => {});
    };
    options?.signal?.addEventListener("abort", abort, { once: true });
    try {
        await chrome.runtime.sendMessage({
            action: "START_IMAGE_GENERATION",
            taskId,
            params,
            startTime,
        });
        const task = await waitForTask(taskId, options?.signal);
        if (task.status !== "success") {
            throw new Error(task.error || "Image generation failed");
        }
        const images = task.images.map((image) => ({ id: image.id, dataUrl: image.dataUrl }));
        window.setTimeout(() => {
            void completeCanvasGeneration(taskId);
        }, 10_000);
        return images;
    } finally {
        options?.signal?.removeEventListener("abort", abort);
    }
}

async function waitForTask(taskId: string, signal?: AbortSignal) {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const task = await db.generationTasks.get(taskId);
        if (task && task.status !== "generating") return task;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Image generation timed out");
}

async function resolveReferenceDataUrl(reference: ReferenceImage): Promise<string> {
    if (reference.dataUrl.startsWith("data:")) return reference.dataUrl;
    if (reference.storageKey) {
        const blob = await getImageBlob(reference.storageKey);
        if (blob) return readFileAsDataUrl(blob);
    }
    const response = await fetch(reference.url || reference.dataUrl);
    return readFileAsDataUrl(await response.blob());
}

function normalizeAspectRatio(value: string): ImageAspectRatio {
    const allowed: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3"];
    return allowed.includes(value as ImageAspectRatio) ? (value as ImageAspectRatio) : "1:1";
}

function normalizeQuality(value: string): "auto" | "standard" | "hd" {
    return value === "standard" || value === "hd" ? value : "auto";
}

export type { ModelChannel };
