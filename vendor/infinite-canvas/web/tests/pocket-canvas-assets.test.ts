import { describe, expect, it } from "bun:test";
import {
    clampFolderWidth,
    DEFAULT_FOLDER_TREE_WIDTH,
    getFolderAndDescendantIds,
    MAX_FOLDER_TREE_WIDTH,
    MIN_FOLDER_TREE_WIDTH,
} from "../src/integrations/picpocket/pocket-canvas-assets";
import {
    computeRangeSelection,
    pruneSelectionToVisible,
    sanitizeAssetFilename,
    uniqueArchiveName,
    type PocketFolder,
} from "../src/integrations/picpocket/pocket-adapter";
import { clampSidePanelWidth } from "../src/stores/use-canvas-side-panel-store";

describe("getFolderAndDescendantIds", () => {
    const mockFolders: PocketFolder[] = [
        {
            id: 1,
            name: "Folder 1",
            parentId: null,
            order: 0,
        },
        {
            id: 11,
            name: "Sub 1-1",
            parentId: 1,
            order: 0,
        },
        {
            id: 111,
            name: "Sub 1-1-1",
            parentId: 11,
            order: 0,
        },
        {
            id: 12,
            name: "Sub 1-2",
            parentId: 1,
            order: 1,
        },
        {
            id: 2,
            name: "Folder 2",
            parentId: null,
            order: 1,
        },
    ];

    it("returns only the folder id when it has no descendants", () => {
        const ids = getFolderAndDescendantIds(mockFolders, 2);
        expect(Array.from(ids)).toEqual([2]);
    });

    it("returns folder and all its nested descendant ids", () => {
        const ids = getFolderAndDescendantIds(mockFolders, 1);
        expect(Array.from(ids).sort((a, b) => a - b)).toEqual([1, 11, 12, 111]);
    });

    it("returns intermediate folder and its subfolder ids", () => {
        const ids = getFolderAndDescendantIds(mockFolders, 11);
        expect(Array.from(ids).sort((a, b) => a - b)).toEqual([11, 111]);
    });

    it("identifies whether selectedId is orphaned by deleting an ancestor folder", () => {
        const deletedIds = getFolderAndDescendantIds(mockFolders, 1);
        const selectedId = 111;
        expect(deletedIds.has(selectedId)).toBe(true);
        const unrelatedSelectedId = 2;
        expect(deletedIds.has(unrelatedSelectedId)).toBe(false);
    });
});

describe("clampFolderWidth across panel container resizes", () => {
    it("returns default width for invalid or NaN inputs", () => {
        expect(clampFolderWidth(Number.NaN)).toBe(DEFAULT_FOLDER_TREE_WIDTH);
        expect(clampFolderWidth(null as unknown as number)).toBe(DEFAULT_FOLDER_TREE_WIDTH);
    });

    it("clamps safely within min and max boundaries", () => {
        expect(clampFolderWidth(80)).toBe(MIN_FOLDER_TREE_WIDTH); // 120
        expect(clampFolderWidth(200)).toBe(200);
        expect(clampFolderWidth(450)).toBe(MAX_FOLDER_TREE_WIDTH); // 320
    });

    it("constrains width dynamically based on side panel container width", () => {
        // When side panel is 300px, 65% is 195px
        expect(clampFolderWidth(250, 300)).toBe(195);
        // When side panel is very narrow (e.g. 150px), falls back to min width 120
        expect(clampFolderWidth(100, 150)).toBe(MIN_FOLDER_TREE_WIDTH);
    });
});

describe("clampSidePanelWidth across screen resolutions", () => {
    it("clamps safely within wide screens", () => {
        // 1920 viewport
        expect(clampSidePanelWidth(320, 1920)).toBe(320);
        expect(clampSidePanelWidth(500, 1920)).toBe(500);
        expect(clampSidePanelWidth(700, 1920)).toBe(560); // capped at MAX 560
    });

    it("clamps safely within split-screen / laptop narrow viewports", () => {
        // 700px split-screen viewport: max available is Math.min(560, 700*0.65=455, 700-180=520) -> 455px
        expect(clampSidePanelWidth(320, 700)).toBe(320);
        expect(clampSidePanelWidth(500, 700)).toBe(455);
    });

    it("guarantees minimum workspace and boundary fallback", () => {
        // Very narrow screen (e.g. 400px): must not blow up
        expect(clampSidePanelWidth(100, 400)).toBe(240); // bounded to MIN 240
        expect(clampSidePanelWidth(Number.NaN, 1920)).toBe(320);
    });
});

describe("computeRangeSelection", () => {
    const assetList = [
        { id: 101, title: "Asset 1" },
        { id: 102, title: "Asset 2" },
        { id: 103, title: "Asset 3" },
        { id: 104, title: "Asset 4" },
        { id: 105, title: "Asset 5" },
    ];

    it("calculates forward continuous range between startIndex and endIndex", () => {
        const selected = computeRangeSelection(assetList, 1, 3);
        expect(Array.from(selected)).toEqual([102, 103, 104]);
    });

    it("handles reverse range selection correctly", () => {
        const selected = computeRangeSelection(assetList, 4, 2);
        expect(Array.from(selected).sort((a, b) => a - b)).toEqual([103, 104, 105]);
    });

    it("preserves existing selection when adding range", () => {
        const existing = [101, 999];
        const selected = computeRangeSelection(assetList, 2, 3, existing);
        expect(Array.from(selected).sort((a, b) => a - b)).toEqual([101, 103, 104, 999]);
    });

    it("clamps safely when indices exceed array boundaries", () => {
        const selected = computeRangeSelection(assetList, -2, 10);
        expect(Array.from(selected)).toEqual([101, 102, 103, 104, 105]);
    });
});

describe("sanitizeAssetFilename", () => {
    it("cleans illegal path and filesystem characters", () => {
        expect(sanitizeAssetFilename('test/image:with*bad?chars"and<pipes>|')).toBe(
            "test_image_with_bad_chars_and_pipes__.png",
        );
    });

    it("appends .png extension if missing", () => {
        expect(sanitizeAssetFilename("my_cool_drawing")).toBe("my_cool_drawing.png");
    });

    it("does not duplicate .png or .PNG extension", () => {
        expect(sanitizeAssetFilename("already_done.png")).toBe("already_done.png");
        expect(sanitizeAssetFilename("photo.PNG")).toBe("photo.PNG");
    });

    it("falls back gracefully when input is empty or null", () => {
        expect(sanitizeAssetFilename("", "fallback")).toBe("fallback.png");
        expect(sanitizeAssetFilename(null, "fallback")).toBe("fallback.png");
        expect(sanitizeAssetFilename(undefined)).toBe("asset.png");
    });
});

describe("sanitizeAssetFilename with mime type", () => {
    it("uses the extension that matches the image mime type", () => {
        expect(sanitizeAssetFilename("photo", "asset", "image/jpeg")).toBe("photo.jpg");
        expect(sanitizeAssetFilename("anim", "asset", "image/gif")).toBe("anim.gif");
        expect(sanitizeAssetFilename("shot", "asset", "image/webp")).toBe("shot.webp");
    });

    it("keeps an existing matching extension without duplicating it", () => {
        expect(sanitizeAssetFilename("pic.JPG", "asset", "image/jpeg")).toBe("pic.JPG");
        expect(sanitizeAssetFilename("pic.jpeg", "asset", "image/jpeg")).toBe("pic.jpeg");
    });

    it("falls back to png for unknown mime types", () => {
        expect(sanitizeAssetFilename("x", "asset", "application/octet-stream")).toBe("x.png");
    });

    it("truncates very long page titles to a filesystem-safe length", () => {
        const name = sanitizeAssetFilename("a".repeat(500), "asset", "image/png");
        expect(name.endsWith(".png")).toBe(true);
        expect(name.length).toBeLessThanOrEqual(124);
    });
});

describe("uniqueArchiveName", () => {
    it("dedupes names case-insensitively and preserves the extension", () => {
        const used = new Set<string>();
        expect(uniqueArchiveName("Cat.jpg", used)).toBe("Cat.jpg");
        expect(uniqueArchiveName("cat.jpg", used)).toBe("cat_1.jpg");
        expect(uniqueArchiveName("CAT.JPG", used)).toBe("CAT_2.JPG");
    });
});

describe("pruneSelectionToVisible", () => {
    it("drops selected ids that are hidden by the current filter", () => {
        const prev = new Set([1, 2, 3]);
        const next = pruneSelectionToVisible(prev, [{ id: 2 }, { id: 3 }, { id: 4 }]);
        expect(Array.from(next).sort()).toEqual([2, 3]);
    });

    it("returns the same set instance when nothing changes", () => {
        const prev = new Set([2]);
        expect(pruneSelectionToVisible(prev, [{ id: 2 }])).toBe(prev);
    });
});

