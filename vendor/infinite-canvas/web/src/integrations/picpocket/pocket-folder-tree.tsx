import { useMemo, useState } from "react";
import { Dropdown, type MenuProps } from "antd";
import { ChevronRight, Edit2, Folder, FolderOpen, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getVisiblePocketFolderRows } from "./folder-tree";
import type { PocketFolder } from "./pocket-adapter";

type Props = {
    folders: PocketFolder[];
    selectedId: number | null;
    onSelect: (folderId: number) => void;
    compact?: boolean;
    dragOverFolderId?: number | null;
    onDragOverFolder?: (folderId: number, event: React.DragEvent) => void;
    onDragLeaveFolder?: (folderId: number, event: React.DragEvent) => void;
    onDropOnFolder?: (folderId: number, event: React.DragEvent) => void;
    onRenameFolder?: (folder: PocketFolder) => void;
    onDeleteFolder?: (folder: PocketFolder) => void;
    onCreateSubFolder?: (folder: PocketFolder) => void;
    folderCounts?: Map<number, number>;
};

export function PocketFolderTree({
    folders,
    selectedId,
    onSelect,
    compact = false,
    dragOverFolderId,
    onDragOverFolder,
    onDragLeaveFolder,
    onDropOnFolder,
    onRenameFolder,
    onDeleteFolder,
    onCreateSubFolder,
    folderCounts,
}: Props) {
    const { t } = useTranslation();
    const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
    const expandedIds = useMemo(
        () => new Set(folders.map((folder) => folder.id).filter((id) => !collapsedIds.has(id))),
        [collapsedIds, folders],
    );
    const rows = useMemo(
        () => getVisiblePocketFolderRows(folders, expandedIds),
        [expandedIds, folders],
    );

    const getFolderMenuItems = (folder: PocketFolder): MenuProps["items"] => [
        ...(onCreateSubFolder
            ? [
                  {
                      key: "new-sub",
                      label: t("canvas.picPocketAssets.newSubFolder"),
                      icon: <FolderPlus className="size-3.5" />,
                      onClick: () => onCreateSubFolder(folder),
                  },
              ]
            : []),
        ...(onRenameFolder
            ? [
                  {
                      key: "rename",
                      label: t("canvas.picPocketAssets.renameFolder"),
                      icon: <Edit2 className="size-3.5" />,
                      onClick: () => onRenameFolder(folder),
                  },
              ]
            : []),
        ...(onDeleteFolder
            ? [
                  {
                      type: "divider" as const,
                  },
                  {
                      key: "delete",
                      label: t("canvas.picPocketAssets.deleteFolder"),
                      icon: <Trash2 className="size-3.5" />,
                      danger: true,
                      onClick: () => onDeleteFolder(folder),
                  },
              ]
            : []),
    ];

    return (
        <div className="space-y-0.5">
            {rows.map((folder) => {
                const active = selectedId === folder.id;
                const expanded = !collapsedIds.has(folder.id);
                const isDragOver = dragOverFolderId === folder.id;
                const count = folderCounts?.get(folder.id);
                const menuItems = getFolderMenuItems(folder);
                const hasMenu = Boolean(menuItems && menuItems.length > 0);

                const rowContent = (
                    <div
                        className={`group/folder flex w-full items-center rounded-md transition-colors ${
                            isDragOver
                                ? "bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-950/80"
                                : active
                                  ? "bg-violet-600 font-medium text-white shadow-xs"
                                  : "text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800"
                        }`}
                        onDragOver={(event) => {
                            if (onDragOverFolder) {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                onDragOverFolder(folder.id, event);
                            }
                        }}
                        onDragLeave={(event) => {
                            onDragLeaveFolder?.(folder.id, event);
                        }}
                        onDrop={(event) => {
                            if (onDropOnFolder) {
                                event.preventDefault();
                                onDropOnFolder(folder.id, event);
                            }
                        }}
                    >
                        {folder.hasChildren ? (
                            <button
                                type="button"
                                aria-label={t(expanded ? "canvas.folderTree.collapse" : "canvas.folderTree.expand")}
                                aria-expanded={expanded}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setCollapsedIds((current) => {
                                        const next = new Set(current);
                                        if (next.has(folder.id)) next.delete(folder.id);
                                        else next.add(folder.id);
                                        return next;
                                    });
                                }}
                                className={`grid shrink-0 place-items-center rounded p-0.5 ${
                                    active ? "hover:bg-white/20" : "hover:bg-black/5 dark:hover:bg-white/10"
                                }`}
                            >
                                <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                            </button>
                        ) : (
                            <span className="w-4 shrink-0" />
                        )}
                        <button
                            type="button"
                            onClick={() => onSelect(folder.id)}
                            title={folder.name}
                            className={`flex min-w-0 flex-1 items-center gap-1.5 pr-1 text-left ${
                                compact ? "py-1 text-[11px]" : "py-1.5 text-xs"
                            }`}
                        >
                            {active ? (
                                <FolderOpen className="size-3.5 shrink-0" />
                            ) : (
                                <Folder className="size-3.5 shrink-0 text-amber-500" />
                            )}
                            <span className="truncate">{folder.name}</span>
                            {typeof count === "number" && count > 0 ? (
                                <span
                                    className={`ml-auto shrink-0 px-1 text-[10px] leading-tight ${
                                        active ? "text-violet-200" : "text-stone-400 dark:text-stone-500"
                                    }`}
                                >
                                    {count}
                                </span>
                            ) : null}
                        </button>
                        {hasMenu ? (
                            <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
                                <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className={`mr-0.5 grid size-5 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover/folder:opacity-100 ${
                                        active
                                            ? "text-white hover:bg-white/20"
                                            : "text-stone-400 hover:bg-stone-300/60 dark:hover:bg-stone-700"
                                    }`}
                                    title={t("canvas.imageTools.more")}
                                >
                                    <MoreHorizontal className="size-3" />
                                </button>
                            </Dropdown>
                        ) : null}
                    </div>
                );

                return (
                    <div
                        key={folder.id}
                        className="relative"
                        style={{ paddingLeft: `${folder.depth * (compact ? 8 : 12)}px` }}
                    >
                        {folder.depth > 0 ? (
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute bottom-0 top-0 border-l border-stone-300/70 dark:border-stone-700"
                                style={{ left: `${folder.depth * (compact ? 8 : 12) - 5}px` }}
                            />
                        ) : null}
                        {hasMenu ? (
                            <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
                                {rowContent}
                            </Dropdown>
                        ) : (
                            rowContent
                        )}
                    </div>
                );
            })}
        </div>
    );
}

