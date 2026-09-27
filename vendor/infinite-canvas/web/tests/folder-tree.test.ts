import { describe, expect, test } from "bun:test";

import { getVisiblePocketFolderRows } from "@/integrations/picpocket/folder-tree";

const folders = [
    { id: 1, name: "Campaigns", parentId: null, order: 1 },
    { id: 2, name: "Summer", parentId: 1, order: 1 },
    { id: 3, name: "Drafts", parentId: 2, order: 1 },
    { id: 4, name: "References", parentId: null, order: 2 },
    { id: 5, name: "Orphan", parentId: 999, order: 3 },
];

describe("getVisiblePocketFolderRows", () => {
    test("hides descendants of collapsed folders", () => {
        expect(getVisiblePocketFolderRows(folders, new Set()).map(({ id, depth }) => ({ id, depth }))).toEqual([
            { id: 1, depth: 0 },
            { id: 4, depth: 0 },
            { id: 5, depth: 0 },
        ]);
    });

    test("shows children in hierarchy order when their parents are expanded", () => {
        expect(getVisiblePocketFolderRows(folders, new Set([1, 2])).map(({ id, depth }) => ({ id, depth }))).toEqual([
            { id: 1, depth: 0 },
            { id: 2, depth: 1 },
            { id: 3, depth: 2 },
            { id: 4, depth: 0 },
            { id: 5, depth: 0 },
        ]);
    });
});
