import type { PocketFolder } from "./pocket-adapter";

export type PocketFolderRow = PocketFolder & { depth: number; hasChildren: boolean };

export function getVisiblePocketFolderRows(
    folders: PocketFolder[],
    expandedIds: ReadonlySet<number>,
): PocketFolderRow[] {
    const children = new Map<number | null, PocketFolder[]>();
    const knownIds = new Set(folders.map((folder) => folder.id));
    folders.forEach((folder) => {
        const parentId = folder.parentId !== null && knownIds.has(folder.parentId) ? folder.parentId : null;
        children.set(parentId, [...(children.get(parentId) || []), folder]);
    });
    const result: PocketFolderRow[] = [];
    const visit = (parentId: number | null, depth: number) => {
        (children.get(parentId) || [])
            .toSorted((a, b) => a.order - b.order)
            .forEach((folder) => {
                const hasChildren = Boolean(children.get(folder.id)?.length);
                result.push({ ...folder, depth, hasChildren });
                if (hasChildren && expandedIds.has(folder.id)) visit(folder.id, depth + 1);
            });
    };
    visit(null, 0);
    return result;
}

export function getFolderAndDescendantIds(folders: PocketFolder[], targetId: number): Set<number> {
    const ids = new Set<number>([targetId]);
    const childrenMap = new Map<number, number[]>();
    for (const folder of folders) {
        if (folder.parentId !== null) {
            const list = childrenMap.get(folder.parentId) || [];
            list.push(folder.id);
            childrenMap.set(folder.parentId, list);
        }
    }
    const queue = [targetId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const children = childrenMap.get(current);
        if (children) {
            for (const childId of children) {
                if (!ids.has(childId)) {
                    ids.add(childId);
                    queue.push(childId);
                }
            }
        }
    }
    return ids;
}
