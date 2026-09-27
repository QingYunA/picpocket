import { useEffect, useMemo, useState } from "react";
import { Empty, Input, Pagination } from "antd";
import { Folder, FolderOpen, Search } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";

import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import {
    listPocketAssetSummaries,
    listPocketFolders,
    resolvePocketCanvasAsset,
} from "./pocket-adapter";
import { PocketFolderTree } from "./pocket-folder-tree";

type Props = {
    onInsert: (payload: InsertAssetPayload, assetId: number) => void;
};

const PAGE_SIZE = 12;

export function PocketAssetPicker({ onInsert }: Props) {
    const { t } = useTranslation();
    const assets = useLiveQuery(listPocketAssetSummaries, []) || [];
    const folders = useLiveQuery(listPocketFolders, []) || [];
    const [folderId, setFolderId] = useState<number | "all" | "inbox">("all");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [insertingId, setInsertingId] = useState<number | null>(null);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return assets.filter((asset) => {
            if (folderId === "inbox" && asset.folderId !== null) return false;
            if (typeof folderId === "number" && asset.folderId !== folderId) return false;
            if (!needle) return true;
            return [asset.title, ...asset.tags].join(" ").toLowerCase().includes(needle);
        });
    }, [assets, folderId, query]);
    const visible = useMemo(
        () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filtered, page],
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
                            current={page}
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
                active ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "hover:bg-stone-200/70 dark:hover:bg-stone-800"
            }`}
        >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}
