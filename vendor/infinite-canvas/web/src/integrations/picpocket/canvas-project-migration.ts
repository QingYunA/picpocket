import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { UploadedImage } from "@/services/image-storage";

type LegacyCanvasProject = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    cards: Array<{
        id: string;
        title?: string;
        width?: number;
        height?: number;
        status?: "idle" | "loading" | "success" | "error";
        prompt?: string;
        model?: string;
        aspectRatio?: string;
        referenceImages?: string[];
        error?: string;
        image?: {
            dataUrl: string;
            prompt: string;
            model?: string;
        };
    }>;
    cardPositions: Record<string, { x: number; y: number }>;
    textNotes: Array<{
        id: string;
        text: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
    }>;
    viewport?: { x: number; y: number; k: number };
};

const LEGACY_PROJECTS_KEY = "picpocket_canvas_projects";
const MIGRATION_BACKUP_KEY = "picpocket_canvas_projects_backup_before_infinite_canvas_v1";
const MIGRATION_MARKER_KEY = "picpocket_infinite_canvas_project_migration_v1";

type ImageWriter = (dataUrl: string) => Promise<UploadedImage>;

export async function migrateLegacyCanvasProjects(
    legacyProjects: LegacyCanvasProject[],
    existingProjects: CanvasProject[],
    writeImage: ImageWriter,
): Promise<CanvasProject[]> {
    const existingIds = new Set(existingProjects.map((project) => project.id));
    const migrated = (
        await Promise.all(
            legacyProjects.map(async (legacy): Promise<CanvasProject | null> => {
                const id = `picpocket-${legacy.id}`;
                if (existingIds.has(id)) return null;
                const imageNodes = await Promise.all(
                    legacy.cards.map(async (card): Promise<CanvasNodeData> => {
                        const position = legacy.cardPositions[card.id] || { x: 80, y: 100 };
                        if (card.image?.dataUrl) {
                            const stored = await writeImage(card.image.dataUrl);
                            return {
                                id: card.id,
                                type: CanvasNodeType.Image,
                                title: card.title || card.image.prompt?.slice(0, 32) || "Image",
                                position,
                                width: card.width || 340,
                                height: card.height || 240,
                                metadata: {
                                    content: stored.url,
                                    storageKey: stored.storageKey,
                                    status: "success",
                                    prompt: card.image.prompt || card.prompt,
                                    model: card.image.model || card.model,
                                    naturalWidth: stored.width,
                                    naturalHeight: stored.height,
                                    bytes: stored.bytes,
                                    mimeType: stored.mimeType,
                                },
                            };
                        }
                        return {
                            id: card.id,
                            type: CanvasNodeType.Image,
                            title: card.title || card.prompt?.slice(0, 32) || "Image",
                            position,
                            width: card.width || 340,
                            height: card.height || 240,
                            metadata: {
                                status: card.status === "error" ? "error" : "idle",
                                prompt: card.prompt,
                                composerContent: card.prompt,
                                model: card.model,
                                size: card.aspectRatio,
                                references: card.referenceImages,
                                errorDetails: card.error,
                            },
                        };
                    }),
                );
                const textNodes: CanvasNodeData[] = legacy.textNotes.map((note) => ({
                    id: note.id,
                    type: CanvasNodeType.Text,
                    title: note.text.slice(0, 32) || "Note",
                    position: { x: note.x, y: note.y },
                    width: note.width || 280,
                    height: note.height || 160,
                    metadata: { content: note.text, status: "success", fontSize: 14 },
                }));
                return {
                    id,
                    title: legacy.title,
                    createdAt: new Date(legacy.createdAt).toISOString(),
                    updatedAt: new Date(legacy.updatedAt).toISOString(),
                    nodes: [...imageNodes, ...textNodes],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: legacy.viewport || { x: 0, y: 0, k: 1 },
                } satisfies CanvasProject;
            }),
        )
    ).filter((project): project is CanvasProject => project !== null);

    return [...migrated, ...existingProjects];
}

export async function commitMigratedProjects(input: {
    replace: () => void;
    persist: () => Promise<void>;
    markComplete: () => Promise<void>;
}): Promise<void> {
    input.replace();
    await input.persist();
    await input.markComplete();
}

export async function runPicPocketCanvasMigration(): Promise<CanvasProject[] | null> {
    if (import.meta.env.VITE_PICPOCKET_EXTENSION !== "1" || typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const stored = await chrome.storage.local.get([LEGACY_PROJECTS_KEY, MIGRATION_MARKER_KEY]);
    if (stored[MIGRATION_MARKER_KEY]) return null;
    const legacyProjects = stored[LEGACY_PROJECTS_KEY] as LegacyCanvasProject[] | undefined;
    if (!Array.isArray(legacyProjects) || legacyProjects.length === 0) {
        await chrome.storage.local.set({ [MIGRATION_MARKER_KEY]: { completedAt: Date.now(), imported: 0 } });
        return null;
    }

    const { persistCanvasProjectsImmediately, useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
    const existingProjects = useCanvasStore.getState().projects;
    await chrome.storage.local.set({ [MIGRATION_BACKUP_KEY]: legacyProjects });
    const { uploadImage } = await import("@/services/image-storage");
    const projects = await migrateLegacyCanvasProjects(legacyProjects, existingProjects, uploadImage);
    const deletedProjects = useCanvasStore.getState().deletedProjects;
    await commitMigratedProjects({
        replace: () => useCanvasStore.getState().replaceProjects(projects, deletedProjects),
        persist: () => persistCanvasProjectsImmediately(projects, deletedProjects),
        markComplete: () => chrome.storage.local.set({
            [MIGRATION_MARKER_KEY]: {
                completedAt: Date.now(),
                imported: projects.length - existingProjects.length,
            },
        }),
    });
    return projects;
}
