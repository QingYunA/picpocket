import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Dropdown, Empty, Input, Modal, type MenuProps } from "antd";
import {
    Check,
    Copy,
    Download,
    Folder,
    FolderInput,
    FolderPlus,
    Inbox,
    Plus,
    Search,
    Trash2,
    X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";

import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import {
    batchDeletePocketItems,
    batchMovePocketItems,
    computeRangeSelection,
    createPocketFolder,
    deletePocketFolder,
    deletePocketItem,
    downloadPocketAssets,
    getActiveFolder,
    getPocketAssetPrompt,
    listPocketAssetSummaries,
    listPocketFolders,
    movePocketItem,
    onActiveFolderChange,
    PICPOCKET_DRAG_TYPE_ASSET,
    PICPOCKET_DRAG_TYPE_ASSETS,
    pruneSelectionToVisible,
    renamePocketFolder,
    resolvePocketCanvasAsset,
    saveCanvasBlobToPocket,
    setActiveFolder,
    type PocketAssetSummary,
    type PocketFolder,
} from "./pocket-adapter";
import { PocketFolderTree } from "./pocket-folder-tree";
import { getFolderAndDescendantIds } from "./folder-tree";
import { useVirtualGrid } from "./virtual-grid";

/** 资产网格布局参数：最小卡片宽 80px、行列间距 8px、卡片标题栏与边框约 27px（仅首帧估算，随后以实测为准） */
const ASSET_GRID_LAYOUT = { minCellWidth: 80, gap: 8, overscanRows: 3, extraCardHeight: 27 };

export const DEFAULT_FOLDER_TREE_WIDTH = 175;
export const MIN_FOLDER_TREE_WIDTH = 120;
export const MAX_FOLDER_TREE_WIDTH = 320;

export function clampFolderWidth(width: number, containerWidth?: number): number {
    if (typeof width !== "number" || Number.isNaN(width)) return DEFAULT_FOLDER_TREE_WIDTH;
    const max = containerWidth
        ? Math.min(MAX_FOLDER_TREE_WIDTH, Math.max(MIN_FOLDER_TREE_WIDTH, Math.floor(containerWidth * 0.65)))
        : MAX_FOLDER_TREE_WIDTH;
    return Math.max(MIN_FOLDER_TREE_WIDTH, Math.min(max, width));
}

export { getFolderAndDescendantIds };

export function PocketCanvasAssets({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const assets = useLiveQuery(listPocketAssetSummaries, []) || [];
    const folders = useLiveQuery(listPocketFolders, []) || [];
    const [query, setQuery] = useState("");
    const [folderId, setFolderId] = useState<number | "all" | "inbox">("all");
    const containerRef = useRef<HTMLDivElement>(null);
    const gridScrollRef = useRef<HTMLDivElement>(null);

    // 多选状态
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(() => new Set());
    // Shift 连选锚点按资产 id 记录：删除、移动、搜索导致列表下标移位时仍能定位正确
    const [anchorAssetId, setAnchorAssetId] = useState<number | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // 左侧文件夹列可调宽度与持久化记忆
    const [folderWidth, setFolderWidth] = useState<number>(() => {
        try {
            const stored = localStorage.getItem("pocket-canvas-folder-width");
            if (stored) {
                const parsed = Number.parseInt(stored, 10);
                if (!Number.isNaN(parsed)) return clampFolderWidth(parsed);
            }
        } catch {}
        return DEFAULT_FOLDER_TREE_WIDTH;
    });

    // 拖拽高亮目标（文件夹 ID 或 inbox / all）
    const [dragOverTarget, setDragOverTarget] = useState<number | "inbox" | "all" | null>(null);

    // 文件夹管理弹窗状态
    const [folderModalState, setFolderModalState] = useState<{
        open: boolean;
        mode: "create" | "rename";
        folder?: PocketFolder;
        parentId?: number | null;
        name: string;
    }>({ open: false, mode: "create", name: "" });

    // 统计各文件夹下的资产数量
    const folderCounts = useMemo(() => {
        const counts = new Map<number, number>();
        for (const folder of folders) {
            const descendantIds = getFolderAndDescendantIds(folders, folder.id);
            let sum = 0;
            for (const asset of assets) {
                if (asset.folderId !== null && descendantIds.has(asset.folderId)) {
                    sum++;
                }
            }
            counts.set(folder.id, sum);
        }
        return counts;
    }, [assets, folders]);

    const inboxCount = useMemo(() => assets.filter((a) => a.folderId === null).length, [assets]);

    // 级联获取当前选中目录及其后代目录集合，避免父级展示空白
    const targetFolderIds = useMemo(() => {
        if (typeof folderId !== "number") return null;
        return getFolderAndDescendantIds(folders, folderId);
    }, [folders, folderId]);

    const activeFolderLabel = useMemo(() => {
        if (folderId === "all") return t("common.all");
        if (folderId === "inbox") return t("canvas.picPocketSave.inbox");
        const found = folders.find((f) => f.id === folderId);
        return found ? found.name : "";
    }, [folderId, folders, t]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return assets.filter((asset) => {
            if (targetFolderIds && (asset.folderId === null || !targetFolderIds.has(asset.folderId))) return false;
            if (folderId === "inbox" && asset.folderId !== null) return false;
            return !needle || [asset.title, ...asset.tags].join(" ").toLowerCase().includes(needle);
        });
    }, [assets, folderId, query, targetFolderIds]);

    const {
        columns: gridColumns,
        range: gridRange,
        measureCardRef,
    } = useVirtualGrid(gridScrollRef, visible.length, ASSET_GRID_LAYOUT);

    // 切换文件夹或搜索后列表整体替换，回到顶部，避免沿用旧滚动位置落在空白区
    useEffect(() => {
        gridScrollRef.current?.scrollTo({ top: 0 });
    }, [folderId, query]);

    // 选区收窄到当前可见资产：已删除或被搜索/筛选隐藏的资产不得参与批量删除、移动与下载
    useEffect(() => {
        setSelectedAssetIds((prev) => pruneSelectionToVisible(prev, visible));
    }, [visible]);

    // 挂载时从持久化存储恢复当前活跃文件夹，并监听外部窗口实时切换同步
    useEffect(() => {
        getActiveFolder().then((active) => {
            if (active) {
                if (typeof active.id === "number") {
                    setFolderId(active.id);
                } else if (active.id === "inbox") {
                    setFolderId("inbox");
                } else {
                    setFolderId("all");
                }
            }
        });

        const unbindFolderChange = onActiveFolderChange((active) => {
            if (!active) {
                setFolderId("all");
            } else if (typeof active.id === "number") {
                setFolderId(active.id);
            } else if (active.id === "inbox") {
                setFolderId("inbox");
            } else {
                setFolderId("all");
            }
        });

        return () => {
            unbindFolderChange();
        };
    }, []);

    // 切换文件夹时清空多选状态并同步活跃文件夹
    const handleSelectFolder = useCallback((id: number | "all" | "inbox") => {
        setFolderId(id);
        setSelectedAssetIds(new Set());
        setAnchorAssetId(null);

        if (typeof id === "number") {
            setActiveFolder({ id }).catch(console.warn);
        } else if (id === "inbox") {
            setActiveFolder({ id: "inbox" }).catch(console.warn);
        } else {
            setActiveFolder({ id: null }).catch(console.warn);
        }
    }, []);

    // 分隔条拖拽调整
    const handleSplitterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = folderWidth;
        let nextWidth = startWidth;

        const onMove = (moveEvent: PointerEvent) => {
            const containerRect = containerRef.current?.getBoundingClientRect();
            const containerWidth = containerRect ? containerRect.width : 500;
            nextWidth = clampFolderWidth(startWidth + moveEvent.clientX - startX, containerWidth);
            setFolderWidth(nextWidth);
        };

        const onUp = () => {
            try {
                localStorage.setItem("pocket-canvas-folder-width", String(nextWidth));
            } catch {}
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    // 插入资产到画布
    const handleInsert = useCallback(
        (asset: PocketAssetSummary) => {
            void resolvePocketCanvasAsset(asset.id).then((full) => {
                if (!full) return;
                onInsert({
                    kind: "image",
                    dataUrl: full.dataUrl,
                    title: full.title,
                    prompt: full.prompt,
                    picpocketAssetId: full.id,
                });
            });
        },
        [onInsert],
    );

    // 批量插入已选资产到画布 (以网格排版分散排布，避免重叠在中心)
    const handleBatchInsert = useCallback(async () => {
        const ids = Array.from(selectedAssetIds);
        if (!ids.length) return;
        const cols = Math.min(3, ids.length);
        const spacing = 360;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const full = await resolvePocketCanvasAsset(id);
            if (!full) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const offset =
                ids.length > 1
                    ? {
                          x: (col - (cols - 1) / 2) * spacing,
                          y: row * spacing,
                      }
                    : undefined;
            onInsert({
                kind: "image",
                dataUrl: full.dataUrl,
                title: full.title,
                prompt: full.prompt,
                picpocketAssetId: full.id,
                offset,
            });
        }
        setSelectedAssetIds(new Set());
    }, [onInsert, selectedAssetIds]);

    // 单张删除资产文件
    const handleDeleteAsset = useCallback(
        (asset: PocketAssetSummary) => {
            modal.confirm({
                title: t("canvas.picPocketAssets.deleteConfirmTitle"),
                content: t("canvas.picPocketAssets.deleteConfirmDesc", { title: asset.title }),
                okText: t("common.delete"),
                okButtonProps: { danger: true },
                cancelText: t("common.cancel"),
                onOk: async () => {
                    try {
                        await deletePocketItem(asset.id);
                        setSelectedAssetIds((prev) => {
                            const next = new Set(prev);
                            next.delete(asset.id);
                            return next;
                        });
                        message.success(t("canvas.picPocketAssets.deleteAssetSuccess"));
                    } catch (error) {
                        console.error(error);
                        message.error(t("canvas.picPocketAssets.deleteAssetFailed"));
                    }
                },
            });
        },
        [message, modal, t],
    );

    // 批量删除资产文件
    const handleBatchDelete = useCallback(() => {
        const ids = Array.from(selectedAssetIds);
        if (!ids.length) return;

        modal.confirm({
            title: t("canvas.picPocketAssets.batchDeleteConfirmTitle", { count: ids.length }),
            content: t("canvas.picPocketAssets.batchDeleteConfirmDesc", { count: ids.length }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await batchDeletePocketItems(ids);
                    setSelectedAssetIds(new Set());
                    message.success(t("canvas.picPocketAssets.batchDeleteSuccess", { count: ids.length }));
                } catch (error) {
                    console.error(error);
                    message.error(t("canvas.picPocketAssets.deleteAssetFailed"));
                }
            },
        });
    }, [message, modal, selectedAssetIds, t]);

    // 单项移动资产到指定文件夹
    const handleMoveAsset = useCallback(
        async (assetId: number, targetId: number | null, folderName: string) => {
            try {
                await movePocketItem(assetId, targetId);
                if (targetId === null) {
                    message.success(t("canvas.picPocketAssets.movedToInbox"));
                } else {
                    message.success(t("canvas.picPocketAssets.movedToFolder", { name: folderName }));
                }
            } catch (error) {
                console.error(error);
                message.error(t("canvas.picPocketAssets.moveFailed"));
            }
        },
        [message, t],
    );

    // 批量移动资产到指定文件夹
    const handleBatchMove = useCallback(
        async (targetId: number | null, folderName: string) => {
            const ids = Array.from(selectedAssetIds);
            if (!ids.length) return;
            try {
                await batchMovePocketItems(ids, targetId);
                setSelectedAssetIds(new Set());
                message.success(
                    t("canvas.picPocketAssets.batchMovedSuccess", {
                        count: ids.length,
                        name: folderName,
                    }),
                );
            } catch (error) {
                console.error(error);
                message.error(t("canvas.picPocketAssets.moveFailed"));
            }
        },
        [message, selectedAssetIds, t],
    );

    // 下载资产（单张或打包 ZIP 批量下载）
    const handleDownload = useCallback(
        async (idsToDownload: number[]) => {
            if (!idsToDownload.length || isDownloading) return;
            setIsDownloading(true);
            const hide = message.loading(t("canvas.picPocketAssets.downloading"), 0);
            try {
                await downloadPocketAssets(idsToDownload);
                message.success(t("canvas.picPocketAssets.downloadSuccess"));
            } catch (error) {
                console.error("Download failed:", error);
                message.error(t("canvas.picPocketAssets.downloadFailed"));
            } finally {
                hide();
                setIsDownloading(false);
            }
        },
        [isDownloading, message, t],
    );

    // 复制提示词
    const handleCopyPrompt = useCallback(
        async (asset: PocketAssetSummary) => {
            try {
                const prompt = await getPocketAssetPrompt(asset.id);
                if (prompt) {
                    await navigator.clipboard.writeText(prompt);
                    message.success(t("canvas.sidePanel.promptCopied"));
                } else {
                    message.info(t("canvas.nodeToolbar.noPrompt"));
                }
            } catch (error) {
                console.error(error);
                message.error(t("canvas.sidePanel.copyFailed"));
            }
        },
        [message, t],
    );

    // 拖拽放置到文件夹处理（支持单张及多选批量拖拽）
    const handleDropOnFolderTarget = useCallback(
        async (target: number | "inbox" | "all", event: React.DragEvent) => {
            setDragOverTarget(null);
            if (target === "all") return;
            const targetFolderId = target === "inbox" ? null : target;
            const targetName =
                target === "inbox"
                    ? t("canvas.picPocketSave.inbox")
                    : folders.find((f) => f.id === target)?.name || "";

            // 优先检查是否为批量拖拽
            const batchData = event.dataTransfer.getData(PICPOCKET_DRAG_TYPE_ASSETS);
            if (batchData) {
                try {
                    const parsed = JSON.parse(batchData);
                    if (Array.isArray(parsed?.ids) && parsed.ids.length > 0) {
                        await batchMovePocketItems(parsed.ids, targetFolderId);
                        setSelectedAssetIds(new Set());
                        message.success(
                            t("canvas.picPocketAssets.batchMovedSuccess", {
                                count: parsed.ids.length,
                                name: targetName,
                            }),
                        );
                        return;
                    }
                } catch (e) {
                    console.error("Failed to parse dragged batch assets", e);
                }
            }

            // 单张拖拽兼容处理
            const data = event.dataTransfer.getData(PICPOCKET_DRAG_TYPE_ASSET);
            if (!data) return;
            try {
                const parsed = JSON.parse(data);
                if (typeof parsed?.id === "number") {
                    await handleMoveAsset(parsed.id, targetFolderId, targetName);
                }
            } catch (error) {
                console.error("Failed to parse dragged asset", error);
            }
        },
        [folders, handleMoveAsset, message, t],
    );

    // 外部图片拖放至右侧网格导入
    const handleDropExternalFiles = useCallback(
        async (event: React.DragEvent) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
            if (!files.length) return;
            const targetFolderId = typeof folderId === "number" ? folderId : null;
            const hide = message.loading(t("canvas.sidePanel.addingAssets"), 0);
            try {
                for (const file of files) {
                    await saveCanvasBlobToPocket(file, {
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        width: 1024,
                        height: 1024,
                        folderId: targetFolderId,
                    });
                }
                message.success(t("canvas.sidePanel.addedAssets", { count: files.length }));
            } catch (error) {
                console.error(error);
                message.error(t("canvas.sidePanel.addFailed"));
            } finally {
                hide();
            }
        },
        [folderId, message, t],
    );

    // 文件夹右键/操作：删除
    const handleDeleteFolder = useCallback(
        (folder: PocketFolder) => {
            modal.confirm({
                title: t("canvas.picPocketAssets.deleteFolderConfirmTitle", { name: folder.name }),
                content: t("canvas.picPocketAssets.deleteFolderConfirmDesc"),
                okText: t("common.delete"),
                okButtonProps: { danger: true },
                cancelText: t("common.cancel"),
                onOk: async () => {
                    try {
                        await deletePocketFolder(folder.id);
                        if (folderId === folder.id) setFolderId("all");
                        message.success(t("canvas.picPocketAssets.folderDeleted"));
                    } catch (error) {
                        console.error(error);
                    }
                },
            });
        },
        [folderId, message, modal, t],
    );

    // 切换单项选择状态
    const toggleSelect = useCallback(
        (id: number, event?: React.MouseEvent) => {
            event?.stopPropagation();
            setSelectedAssetIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            setAnchorAssetId(id);
        },
        [],
    );

    // 全选 / 取消全选
    const handleSelectAll = useCallback(() => {
        setSelectedAssetIds(new Set(visible.map((a) => a.id)));
    }, [visible]);

    const handleDeselectAll = useCallback(() => {
        setSelectedAssetIds(new Set());
    }, []);

    // 卡片点击交互（支持 Shift 连选、Cmd/Ctrl 多选、多选模式切换、普通单击插入）
    const handleCardClick = useCallback(
        (asset: PocketAssetSummary, index: number, event: React.MouseEvent) => {
            const anchorIndex = anchorAssetId === null ? -1 : visible.findIndex((a) => a.id === anchorAssetId);
            if (event.shiftKey && anchorIndex !== -1) {
                const nextSelected = computeRangeSelection(visible, anchorIndex, index, selectedAssetIds);
                setSelectedAssetIds(nextSelected);
                return;
            }

            if (event.metaKey || event.ctrlKey) {
                toggleSelect(asset.id, event);
                return;
            }

            if (selectedAssetIds.size > 0) {
                toggleSelect(asset.id, event);
                return;
            }

            handleInsert(asset);
        },
        [anchorAssetId, handleInsert, selectedAssetIds, toggleSelect, visible],
    );

    // 辅助生成文件夹移动菜单项
    const buildFolderMenuItems = useCallback(
        (
            onMove: (targetFolderId: number | null, folderName: string) => void,
            disabledFolderId?: number | null,
        ): MenuProps["items"] => [
            {
                key: "move-inbox",
                label: t("canvas.picPocketSave.inbox"),
                disabled: disabledFolderId === null,
                onClick: () => onMove(null, t("canvas.picPocketSave.inbox")),
            },
            ...(folders.length > 0 ? [{ type: "divider" as const }] : []),
            ...folders.map((f) => ({
                key: `move-${f.id}`,
                label: f.name,
                disabled: disabledFolderId === f.id,
                onClick: () => onMove(f.id, f.name),
            })),
        ],
        [folders, t],
    );

    // 批量文件夹移动菜单选项列表
    const folderMoveChildren: MenuProps["items"] = useMemo(
        () => buildFolderMenuItems((targetId, name) => void handleBatchMove(targetId, name)),
        [buildFolderMenuItems, handleBatchMove],
    );

    // 资产卡片右键菜单项生成（区分单选与多选模式）
    const getAssetContextMenu = useCallback(
        (asset: PocketAssetSummary): MenuProps["items"] => {
            const isBatchActive = selectedAssetIds.has(asset.id);

            if (isBatchActive) {
                const count = selectedAssetIds.size;
                return [
                    {
                        key: "batch-insert",
                        label:
                            count > 1
                                ? t("canvas.picPocketAssets.batchInsertCount", { count })
                                : t("canvas.picPocketAssets.insertToCanvas"),
                        icon: <Plus className="size-3.5" />,
                        onClick: () => void handleBatchInsert(),
                    },
                    {
                        key: "batch-move",
                        label:
                            count > 1
                                ? t("canvas.picPocketAssets.batchMoveCount", { count })
                                : t("canvas.picPocketAssets.moveToFolder"),
                        icon: <FolderInput className="size-3.5" />,
                        children: folderMoveChildren,
                    },
                    {
                        key: "batch-download",
                        label:
                            count > 1
                                ? t("canvas.picPocketAssets.batchDownloadCount", { count })
                                : t("canvas.picPocketAssets.downloadSingle"),
                        icon: <Download className="size-3.5" />,
                        onClick: () => void handleDownload(Array.from(selectedAssetIds)),
                    },
                    {
                        type: "divider",
                    },
                    {
                        key: "batch-delete",
                        label:
                            count > 1
                                ? t("canvas.picPocketAssets.batchDeleteCount", { count })
                                : t("canvas.picPocketAssets.deleteAsset"),
                        icon: <Trash2 className="size-3.5" />,
                        danger: true,
                        onClick: handleBatchDelete,
                    },
                    {
                        type: "divider",
                    },
                    {
                        key: "deselect",
                        label: t("canvas.picPocketAssets.deselectAll"),
                        icon: <X className="size-3.5" />,
                        onClick: handleDeselectAll,
                    },
                ];
            }

            // 单张卡片上下文菜单 (未处于选中集合时)
            const singleFolderChildren = buildFolderMenuItems(
                (targetId, name) => void handleMoveAsset(asset.id, targetId, name),
                asset.folderId,
            );

            return [
                {
                    key: "insert",
                    label: t("canvas.picPocketAssets.insertToCanvas"),
                    icon: <Plus className="size-3.5" />,
                    onClick: () => handleInsert(asset),
                },
                {
                    type: "divider",
                },
                {
                    key: "move",
                    label: t("canvas.picPocketAssets.moveToFolder"),
                    icon: <FolderInput className="size-3.5" />,
                    children: singleFolderChildren,
                },
                {
                    key: "copyPrompt",
                    label: t("canvas.imageTools.copyPrompt"),
                    icon: <Copy className="size-3.5" />,
                    onClick: () => void handleCopyPrompt(asset),
                },
                {
                    key: "download",
                    label: t("canvas.picPocketAssets.downloadSingle"),
                    icon: <Download className="size-3.5" />,
                    onClick: () => void handleDownload([asset.id]),
                },
                {
                    type: "divider",
                },
                {
                    key: "select",
                    label: t("canvas.picPocketAssets.batchSelect"),
                    icon: <Check className="size-3.5" />,
                    onClick: () => {
                        toggleSelect(asset.id);
                    },
                },
                {
                    key: "delete",
                    label: t("canvas.picPocketAssets.deleteAsset"),
                    icon: <Trash2 className="size-3.5" />,
                    danger: true,
                    onClick: () => handleDeleteAsset(asset),
                },
            ];
        },
        [
            buildFolderMenuItems,
            folderMoveChildren,
            handleBatchDelete,
            handleBatchInsert,
            handleCopyPrompt,
            handleDeleteAsset,
            handleDeselectAll,
            handleDownload,
            handleInsert,
            handleMoveAsset,
            selectedAssetIds,
            t,
            toggleSelect,
            visible,
        ],
    );

    const isSelecting = selectedAssetIds.size > 0;

    return (
        <div ref={containerRef} className="flex h-full min-h-0 flex-row overflow-hidden">
            {/* 左侧：文件夹层级 (Folder Hierarchy) */}
            <aside
                className="flex h-full shrink-0 flex-col bg-stone-50/60 dark:bg-stone-900/40"
                style={{ width: folderWidth }}
            >
                {/* 顶栏：标题与新建顶级文件夹按钮 */}
                <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-2.5 py-1.5 dark:border-stone-800">
                    <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                        {t("canvas.sidePanel.assets")}
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            setFolderModalState({
                                open: true,
                                mode: "create",
                                parentId: null,
                                name: "",
                            })
                        }
                        title={t("canvas.picPocketAssets.newFolder")}
                        className="grid size-5 place-items-center rounded text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                    >
                        <FolderPlus className="size-3.5" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 space-y-0.5 overflow-y-auto overflow-x-hidden p-1.5">
                    <FolderFilter
                        active={folderId === "all"}
                        icon={Folder}
                        label={t("common.all")}
                        count={assets.length}
                        isDragOver={dragOverTarget === "all"}
                        onDragOver={() => setDragOverTarget("all")}
                        onDragLeave={() => setDragOverTarget((c) => (c === "all" ? null : c))}
                        onDrop={(e) => void handleDropOnFolderTarget("all", e)}
                        onClick={() => handleSelectFolder("all")}
                    />
                    <FolderFilter
                        active={folderId === "inbox"}
                        icon={Inbox}
                        label={t("canvas.picPocketSave.inbox")}
                        count={inboxCount}
                        isDragOver={dragOverTarget === "inbox"}
                        onDragOver={() => setDragOverTarget("inbox")}
                        onDragLeave={() => setDragOverTarget((c) => (c === "inbox" ? null : c))}
                        onDrop={(e) => void handleDropOnFolderTarget("inbox", e)}
                        onClick={() => handleSelectFolder("inbox")}
                    />
                    <div className="pt-0.5">
                        <PocketFolderTree
                            folders={folders}
                            selectedId={typeof folderId === "number" ? folderId : null}
                            onSelect={handleSelectFolder}
                            folderCounts={folderCounts}
                            dragOverFolderId={typeof dragOverTarget === "number" ? dragOverTarget : null}
                            onDragOverFolder={(fId) => setDragOverTarget(fId)}
                            onDragLeaveFolder={(fId) => setDragOverTarget((c) => (c === fId ? null : c))}
                            onDropOnFolder={(fId, e) => void handleDropOnFolderTarget(fId, e)}
                            onCreateSubFolder={(f) =>
                                setFolderModalState({
                                    open: true,
                                    mode: "create",
                                    parentId: f.id,
                                    name: "",
                                })
                            }
                            onRenameFolder={(f) =>
                                setFolderModalState({
                                    open: true,
                                    mode: "rename",
                                    folder: f,
                                    name: f.name,
                                })
                            }
                            onDeleteFolder={handleDeleteFolder}
                            compact
                        />
                    </div>
                </div>
            </aside>

            {/* 可拖拽左右分割条 (Splitter) */}
            <div
                role="separator"
                aria-orientation="vertical"
                title={t("canvas.picPocketAssets.folderPanelResize")}
                onPointerDown={handleSplitterPointerDown}
                onDoubleClick={() => {
                    setFolderWidth(DEFAULT_FOLDER_TREE_WIDTH);
                    try {
                        localStorage.setItem("pocket-canvas-folder-width", String(DEFAULT_FOLDER_TREE_WIDTH));
                    } catch {}
                }}
                className="group relative z-20 flex w-1.5 shrink-0 cursor-col-resize select-none items-center justify-center transition-colors hover:bg-stone-300/40 active:bg-violet-500/20 dark:hover:bg-stone-700/40"
            >
                <div className="h-full w-px bg-stone-200 transition-colors group-hover:bg-violet-400 group-active:bg-violet-600 dark:bg-stone-800" />
            </div>

            {/* 右侧：所选文件夹下的资产文件 (Folder Assets) */}
            <section
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                    }
                }}
                onDrop={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                        void handleDropExternalFiles(e);
                    }
                }}
            >
                <div className="shrink-0 space-y-1.5 px-2.5 pb-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                        <span className="truncate font-medium text-stone-700 dark:text-stone-200" title={activeFolderLabel}>
                            {activeFolderLabel}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                            <span className="shrink-0 text-[11px] opacity-70">
                                {visible.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (isSelecting) handleDeselectAll();
                                    else handleSelectAll();
                                }}
                                title={isSelecting ? t("canvas.picPocketAssets.deselectAll") : t("canvas.picPocketAssets.batchSelect")}
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
                                    isSelecting
                                        ? "bg-violet-100 font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                                        : "text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                                }`}
                            >
                                {isSelecting ? t("canvas.picPocketAssets.deselectAll") : t("canvas.picPocketAssets.batchSelect")}
                            </button>
                        </div>
                    </div>

                    <Input
                        size="small"
                        allowClear
                        prefix={<Search className="size-3.5 text-stone-400" />}
                        placeholder={t("canvas.sidePanel.searchAssets")}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />

                    {/* 批量操作工具栏 */}
                    {isSelecting ? (
                        <div className="flex items-center justify-between gap-1 rounded-lg border border-violet-200 bg-violet-50/90 px-2.5 py-1 text-xs shadow-2xs dark:border-violet-800/80 dark:bg-violet-950/60">
                            <div className="flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap text-violet-700 dark:text-violet-300">
                                <span>{t("canvas.picPocketAssets.selectedCount", { count: selectedAssetIds.size })}</span>
                                <button
                                    type="button"
                                    onClick={selectedAssetIds.size === visible.length ? handleDeselectAll : handleSelectAll}
                                    className="ml-1 shrink-0 whitespace-nowrap text-[11px] text-violet-600 underline opacity-85 hover:opacity-100 dark:text-violet-400"
                                >
                                    {selectedAssetIds.size === visible.length
                                        ? t("canvas.picPocketAssets.deselectAll")
                                        : t("canvas.picPocketAssets.selectAll")}
                                </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<Plus className="size-3.5" />}
                                    onClick={() => void handleBatchInsert()}
                                    title={t("canvas.picPocketAssets.batchInsert")}
                                    className="size-6 p-0 text-stone-600 hover:text-violet-600 dark:text-stone-300"
                                />
                                <Dropdown menu={{ items: folderMoveChildren }} trigger={["click"]}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<FolderInput className="size-3.5" />}
                                        title={t("canvas.picPocketAssets.batchMove")}
                                        className="size-6 p-0 text-stone-600 hover:text-violet-600 dark:text-stone-300"
                                    />
                                </Dropdown>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<Download className="size-3.5" />}
                                    onClick={() => void handleDownload(Array.from(selectedAssetIds))}
                                    title={t("canvas.picPocketAssets.batchDownload")}
                                    className="size-6 p-0 text-stone-600 hover:text-violet-600 dark:text-stone-300"
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Trash2 className="size-3.5" />}
                                    onClick={handleBatchDelete}
                                    title={t("canvas.picPocketAssets.batchDelete")}
                                    className="size-6 p-0"
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<X className="size-3.5" />}
                                    onClick={handleDeselectAll}
                                    title={t("common.cancel")}
                                    className="size-6 p-0 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                                />
                            </div>
                        </div>
                    ) : null}
                </div>

                <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
                    {visible.length ? (
                        <div style={{ height: gridRange.totalHeight, position: "relative" }}>
                            <div
                                className="grid"
                                style={{
                                    gap: ASSET_GRID_LAYOUT.gap,
                                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                                    transform: `translateY(${gridRange.offsetTop}px)`,
                                }}
                            >
                                {visible.slice(gridRange.startIndex, gridRange.endIndex).map((asset, offset) => {
                                    const index = gridRange.startIndex + offset;
                                    const menuItems = getAssetContextMenu(asset);
                                    const isSelected = selectedAssetIds.has(asset.id);

                                    return (
                                        <div key={asset.id} ref={offset === 0 ? measureCardRef : undefined}>
                                            <Dropdown
                                                menu={{ items: menuItems }}
                                                trigger={["contextMenu"]}
                                            >
                                                <div
                                                    draggable
                                                    onDragStart={(event) => {
                                                        const isCurrentSelected = selectedAssetIds.has(asset.id);
                                                        const draggingIds =
                                                            isCurrentSelected && selectedAssetIds.size > 1
                                                                ? Array.from(selectedAssetIds)
                                                                : [asset.id];

                                                        // 批量数据
                                                        event.dataTransfer.setData(
                                                            PICPOCKET_DRAG_TYPE_ASSETS,
                                                            JSON.stringify({ ids: draggingIds }),
                                                        );

                                                        // 单个资产数据兼容
                                                        const payload = {
                                                            type: "picpocket-asset",
                                                            id: asset.id,
                                                            title: asset.title,
                                                            previewDataUrl: asset.previewDataUrl,
                                                        };
                                                        event.dataTransfer.setData(
                                                            PICPOCKET_DRAG_TYPE_ASSET,
                                                            JSON.stringify(payload),
                                                        );
                                                        event.dataTransfer.setData("text/plain", asset.title);
                                                        event.dataTransfer.effectAllowed = "copyMove";
                                                    }}
                                                    onClick={(e) => handleCardClick(asset, index, e)}
                                                    title={asset.title}
                                                    className={`group relative cursor-pointer overflow-hidden rounded-lg border text-left transition ${
                                                        isSelected
                                                            ? "border-violet-500 bg-violet-50/30 ring-2 ring-violet-500/80 shadow-xs dark:bg-violet-950/40"
                                                            : "border-stone-200 bg-white hover:border-violet-400 hover:shadow-xs dark:border-stone-700 dark:bg-stone-900"
                                                    }`}
                                                >
                                                    {/* 多选勾选复选框 */}
                                                    <div
                                                        role="checkbox"
                                                        aria-checked={isSelected}
                                                        tabIndex={0}
                                                        onClick={(e) => toggleSelect(asset.id, e)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                toggleSelect(asset.id);
                                                            }
                                                        }}
                                                        title={
                                                            isSelected
                                                                ? t("canvas.picPocketAssets.deselectAll")
                                                                : t("canvas.picPocketAssets.batchSelect")
                                                        }
                                                        className={`absolute left-1 top-1 z-10 grid size-4.5 place-items-center rounded border transition-all ${
                                                            isSelected
                                                                ? "border-violet-600 bg-violet-600 text-white shadow-xs"
                                                                : isSelecting
                                                                  ? "border-stone-400/80 bg-white/90 text-transparent backdrop-blur hover:border-violet-500 dark:border-stone-500 dark:bg-stone-900/90"
                                                                  : "border-white/80 bg-black/40 text-transparent opacity-0 group-hover:opacity-100 hover:bg-black/60"
                                                        }`}
                                                    >
                                                        <Check className="size-3 stroke-[3]" />
                                                    </div>

                                                    <img
                                                        src={asset.previewDataUrl}
                                                        alt={asset.title}
                                                        referrerPolicy="no-referrer"
                                                        onError={(event) => {
                                                            event.currentTarget.style.opacity = "0.3";
                                                        }}
                                                        className="aspect-square w-full object-cover"
                                                    />
                                                    <div className="truncate px-1.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                                                        {asset.title}
                                                    </div>

                                                    {/* 悬停快捷单张删除（非多选模式下可用） */}
                                                    {!isSelecting ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteAsset(asset);
                                                            }}
                                                            title={t("canvas.picPocketAssets.deleteAsset")}
                                                            className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-white/90 text-stone-500 opacity-0 shadow-xs backdrop-blur transition-opacity hover:bg-white hover:text-red-500 group-hover:opacity-100 dark:bg-stone-900/90 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-red-400"
                                                        >
                                                            <Trash2 className="size-3" />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </Dropdown>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t("canvas.sidePanel.noAssets")}
                            className="pt-14"
                        />
                    )}
                </div>
            </section>

            {/* 新建 / 重命名 文件夹弹窗 */}
            <Modal
                title={
                    folderModalState.mode === "create"
                        ? t("canvas.picPocketAssets.newFolder")
                        : t("canvas.picPocketAssets.renameFolder")
                }
                open={folderModalState.open}
                onCancel={() => setFolderModalState((s) => ({ ...s, open: false }))}
                onOk={async () => {
                    const name = folderModalState.name.trim();
                    if (!name) return;
                    if (folderModalState.mode === "create") {
                        await createPocketFolder(name, folderModalState.parentId ?? null);
                        message.success(t("canvas.picPocketAssets.folderCreated"));
                    } else if (folderModalState.folder) {
                        await renamePocketFolder(folderModalState.folder.id, name);
                        message.success(t("canvas.picPocketAssets.folderRenamed"));
                    }
                    setFolderModalState((s) => ({ ...s, open: false }));
                }}
            >
                <div className="pt-3">
                    <Input
                        autoFocus
                        placeholder={t("canvas.picPocketAssets.folderNamePlaceholder")}
                        value={folderModalState.name}
                        onChange={(e) => setFolderModalState((s) => ({ ...s, name: e.target.value }))}
                        onPressEnter={() => {
                            const name = folderModalState.name.trim();
                            if (!name) return;
                            if (folderModalState.mode === "create") {
                                void createPocketFolder(name, folderModalState.parentId ?? null).then(() => {
                                    message.success(t("canvas.picPocketAssets.folderCreated"));
                                    setFolderModalState((s) => ({ ...s, open: false }));
                                });
                            } else if (folderModalState.folder) {
                                void renamePocketFolder(folderModalState.folder.id, name).then(() => {
                                    message.success(t("canvas.picPocketAssets.folderRenamed"));
                                    setFolderModalState((s) => ({ ...s, open: false }));
                                });
                            }
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
}

function FolderFilter({
    active,
    label,
    count,
    isDragOver = false,
    icon: Icon = Folder,
    onClick,
    onDragOver,
    onDragLeave,
    onDrop,
}: {
    active: boolean;
    label: string;
    count?: number;
    isDragOver?: boolean;
    icon?: typeof Folder;
    onClick: () => void;
    onDragOver?: (event: React.DragEvent) => void;
    onDragLeave?: (event: React.DragEvent) => void;
    onDrop?: (event: React.DragEvent) => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            onDragOver={(e) => {
                if (onDragOver) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    onDragOver(e);
                }
            }}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${
                isDragOver
                    ? "bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-950/80"
                    : active
                      ? "bg-violet-600 font-medium text-white shadow-xs"
                      : "text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800"
            }`}
        >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
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
    );
}
