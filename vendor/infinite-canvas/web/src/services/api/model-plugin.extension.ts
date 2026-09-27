import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

export type PluginHttpOptions = {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    responseType?: "json" | "blob" | "text" | "arraybuffer";
};
export type PluginPollOptions = { intervalMs?: number; timeoutMs?: number };
export type RunPluginArgs = {
    capability: ModelCapability;
    script: string;
    config: AiConfig;
    prompt?: string;
    images?: string[];
    videos?: File[];
    audios?: File[];
    messages?: unknown[];
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
};
export type PluginVariable = { name: string; type: string; desc: string; capabilities?: ModelCapability[] };
export type PluginTemplate = { label: string; script: string };

export async function runModelPlugin<T = unknown>(_args: RunPluginArgs): Promise<T> {
    throw new Error("Custom model scripts are unavailable in the PicPocket extension");
}

export function getPluginVariables(): PluginVariable[] {
    return [];
}

export function getPluginReturn(_capability: ModelCapability): string {
    return "";
}

export function getPluginAuthoringPrompt(_capability: ModelCapability, _modelName: string, _draft = ""): string {
    return "";
}

export function getPluginTemplates(): Record<ModelCapability, PluginTemplate[]> {
    return { image: [], video: [], text: [], audio: [] };
}

export function normalizePluginImages(_result: unknown): string[] {
    return [];
}
