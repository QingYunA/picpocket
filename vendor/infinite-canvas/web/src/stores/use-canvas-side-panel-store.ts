import { create } from "zustand";

export const CANVAS_SIDE_PANEL_MOTION_MS = 500;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 240;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 560;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 320;
const LEGACY_SIDE_PANEL_DEFAULT_WIDTH = 280;

const WIDTH_KEY = "canvas-side-panel-width";
const OPEN_KEY = "canvas-side-panel-open";

export function clampSidePanelWidth(width: number, viewportWidth?: number): number {
    if (!Number.isFinite(width)) return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    const screenW = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1920);
    const dynamicMax = Math.max(
        CANVAS_SIDE_PANEL_MIN_WIDTH,
        Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.floor(screenW * 0.65), screenW - 180),
    );
    return Math.min(dynamicMax, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, Math.round(width)));
}

function initialWidth() {
    if (typeof window === "undefined") return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    try {
        const stored = Number(localStorage.getItem(WIDTH_KEY));
        if (!stored || stored === LEGACY_SIDE_PANEL_DEFAULT_WIDTH) {
            return clampSidePanelWidth(CANVAS_SIDE_PANEL_DEFAULT_WIDTH);
        }
        return clampSidePanelWidth(stored);
    } catch {
        return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    }
}

function initialOpen() {
    if (typeof window === "undefined") return true;
    try {
        return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
        return true;
    }
}

type CanvasSidePanelStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    setWidth: (width: number) => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
};

export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    width: initialWidth(),
    panelOpen: initialOpen(),
    panelMounted: initialOpen(),
    panelClosing: false,
    setWidth: (width) => set({ width }),
    openPanel: () => {
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "1");
        set({ panelOpen: true, panelMounted: true, panelClosing: false });
    },
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "0");
        set({ panelOpen: false, panelClosing: true });
        setTimeout(() => {
            if (get().panelClosing) set({ panelMounted: false, panelClosing: false });
        }, CANVAS_SIDE_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
}));
