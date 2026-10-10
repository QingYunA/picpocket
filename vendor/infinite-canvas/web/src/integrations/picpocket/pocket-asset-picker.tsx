import { useEffect, useMemo, useState } from "react";
import { App, Empty, Input, Pagination } from "antd";
import { Folder, FolderOpen, Search } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";

import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import {
    listPocketAssetSummaries,
    listPocketFolders,
    resolvePocketCanvasAsset,
} from "./pocket-adapter";
import { getFolderAndDescendantIds } from "./folder-tree";
import { PocketFolderTree } from "./pocket-folder-tree";

type Props = {
    onInsert: (payload: InsertAssetPayload, assetId: number) => void;
};

const PAGE_SIZE = 12;

export function PocketAssetPicker({ onInsert }: Props) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const assets = useLiveQuery(listPocketAssetSummaries, []) || [];
    const folders = useLiveQuery(listPocketFolders, []) || [];
    const [folderId, setFolderId] = useState<number | "all" | "inbox">("all");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [insertingId, setInsertingId] = useState<number | null>(null);
    // 选中父文件夹时连同子文件夹里的资产一起显示，与画布侧栏的资产面板保持一致
    const targetFolderIds = useMemo(() => (typeof folderId === "number" ? getFolderAndDescendantIds(folders, folderId) : null), [folders, folderId]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return assets.filter((asset) => {
            if (folderId === "inbox" && asset.folderId !== null) return false;
            if (targetFolderIds && (asset.folderId === null || !targetFolderIds.has(asset.folderId))) return false;
            if (!needle) return true;
            return [asset.title, ...asset.tags].join(" ").toLowerCase().includes(needle);
        });
    }, [assets, folderId, query, targetFolderIds]);
    // 删除资产后总页数可能变少，当前页不能停在超出范围的位置上
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    const visible = useMemo(
        () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filtered, currentPage],
    );

    useEffect(() => {
        setPage(1);
    }, [folderId, query]);

    const insert = async (id: number) => {
        setInsertingId(id);
        try {
            const asset = await resolvePocketCanvasAsset(id);
            if (!asset) return;
            onInsert({
                kind: "image",
                dataUrl: asset.dataUrl,
                title: asset.title,
                prompt: asset.prompt,
                picpocketAssetId: asset.id,
            }, id);
        } catch (error) {
            console.error("[PicPocket] Failed to insert pocket asset", error);
            message.error(t("canvas.picPocketAssets.insertFailed"));
        } finally {
            setInsertingId(null);
        }
    };

    return (
        <div className="grid min-h-[480px] grid-cols-[180px_minmax(0,1fr)] overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
            <aside className="border-r border-stone-200 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-900/60">
                <FolderButton active={folderId === "all"} label={t("common.all")} onClick={() => setFolderId("all")} />
                <FolderButton active={folderId === "inbox"} label={t("canvas.picPocketSave.inbox")} onClick={() => setFolderId("inbox")} />
                <div className="mt-1 max-h-[390px] overflow-y-auto">
                    <PocketFolderTree
                        folders={folders}
                        selectedId={typeof folderId === "number" ? folderId : null}
                        onSelect={setFolderId}
                    />
                </div>
            </aside>
            <section className="min-w-0 p-4">
                <Input
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder={t("canvas.assetPicker.search")}
                    value={query}
                    allowClear
                    onChange={(event) => setQuery(event.target.value)}
                />
                {visible.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                        {visible.map((asset) => (
                            <button
                                key={asset.id}
                                type="button"
                                disabled={insertingId === asset.id}
                                onClick={() => void insert(asset.id)}
                                className="group overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-violet-400 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900"
                            >
                                <img
                                    src={asset.previewDataUrl}
                                    alt={asset.title}
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                        event.currentTarget.style.opacity = "0.3";
                                    }}
                                    className="aspect-[4/3] w-full object-cover"
                                />
                                <div className="truncate px-2.5 py-2 text-xs font-medium">{asset.title}</div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.assetPicker.empty")} className="py-24" />
                )}
                {filtered.length > PAGE_SIZE ? (
                    <div className="mt-4 flex justify-center">
                        <Pagination
                            size="small"
                            current={currentPage}
                            pageSize={PAGE_SIZE}
                            total={filtered.length}
                            onChange={setPage}
                            showSizeChanger={false}
                        />
                    </div>
                ) : null}
            </section>
        </div>
    );
}

function FolderButton({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    const Icon = active ? FolderOpen : Folder;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                active ? "bg-violet-600 font-medium text-white" : "text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800"
            }`}
        >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}
