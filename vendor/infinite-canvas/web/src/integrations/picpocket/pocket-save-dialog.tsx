import { useCallback, useMemo, useState } from "react";
import { App, Button, Dropdown, Input, Modal, type MenuProps } from "antd";
import { FolderPlus, Inbox } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";

import { getFolderAndDescendantIds } from "./folder-tree";
import {
    createPocketFolder,
    deletePocketFolder,
    listPocketFolders,
    renamePocketFolder,
    type PocketFolder,
} from "./pocket-adapter";
import { PocketFolderTree } from "./pocket-folder-tree";

type Props = {
    open: boolean;
    saving: boolean;
    onClose: () => void;
    onSave: (folderId: number | null) => void;
};

export function PocketSaveDialog({ open, saving, onClose, onSave }: Props) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const folders = useLiveQuery(listPocketFolders, []) || [];
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const [folderModalState, setFolderModalState] = useState<{
        open: boolean;
        mode: "create" | "rename";
        parentId?: number | null;
        folder?: PocketFolder;
        name: string;
    }>({
        open: false,
        mode: "create",
        name: "",
    });

    const selectedFolder = useMemo(
        () => (selectedId ? folders.find((f) => f.id === selectedId) : null),
        [folders, selectedId],
    );

    const handleOpenCreate = useCallback((parentId: number | null = null) => {
        setFolderModalState({
            open: true,
            mode: "create",
            parentId,
            name: "",
        });
    }, []);

    const handleOpenRename = useCallback((folder: PocketFolder) => {
        setFolderModalState({
            open: true,
            mode: "rename",
            folder,
            name: folder.name,
        });
    }, []);

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
                        const descendantIds = getFolderAndDescendantIds(folders, folder.id);
                        if (selectedId !== null && descendantIds.has(selectedId)) {
                            setSelectedId(null);
                        }
                        message.success(t("canvas.picPocketAssets.folderDeleted"));
                    } catch (error) {
                        console.error(error);
                        message.error(t("canvas.picPocketSave.failed"));
                    }
                },
            });
        },
        [folders, message, modal, selectedId, t],
    );

    const handleConfirmFolderModal = useCallback(async () => {
        const name = folderModalState.name.trim();
        if (!name) return;

        if (folderModalState.mode === "create") {
            try {
                const newId = await createPocketFolder(name, folderModalState.parentId ?? null);
                message.success(t("canvas.picPocketAssets.folderCreated"));
                setSelectedId(newId);
                setFolderModalState((s) => ({ ...s, open: false }));
            } catch (error) {
                console.error(error);
                message.error(t("canvas.picPocketSave.failed"));
            }
        } else if (folderModalState.folder) {
            try {
                await renamePocketFolder(folderModalState.folder.id, name);
                message.success(t("canvas.picPocketAssets.folderRenamed"));
                setFolderModalState((s) => ({ ...s, open: false }));
            } catch (error) {
                console.error(error);
                message.error(t("canvas.picPocketSave.failed"));
            }
        }
    }, [folderModalState, message, t]);

    const rootContextMenuItems: MenuProps["items"] = useMemo(
        () => [
            {
                key: "new-root-folder",
                label: t("canvas.picPocketAssets.newFolder"),
                icon: <FolderPlus className="size-3.5" />,
                onClick: () => handleOpenCreate(null),
            },
        ],
        [handleOpenCreate, t],
    );

    return (
        <>
            <Modal
                open={open}
                title={t("canvas.picPocketSave.title")}
                onCancel={onClose}
                footer={
                    <Button type="primary" loading={saving} onClick={() => onSave(selectedId)}>
                        {t("canvas.picPocketSave.save")}
                    </Button>
                }
            >
                <div className="py-2">
                    {/* 目录栏顶部操作与提示 */}
                    <div className="flex items-center justify-between pb-2 text-xs text-stone-500 dark:text-stone-400">
                        <span>{t("canvas.picPocketSave.selectFolder")}</span>
                        <div className="flex items-center gap-1">
                            {selectedFolder ? (
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<FolderPlus className="size-3.5" />}
                                    onClick={() => handleOpenCreate(selectedFolder.id)}
                                    className="text-xs"
                                >
                                    {t("canvas.picPocketAssets.newSubFolder")}
                                </Button>
                            ) : null}
                            <Button
                                size="small"
                                type="text"
                                icon={<FolderPlus className="size-3.5" />}
                                onClick={() => handleOpenCreate(null)}
                                className="text-xs"
                            >
                                {t("canvas.picPocketAssets.newFolder")}
                            </Button>
                        </div>
                    </div>

                    {/* 文件夹树容器，阻止原生上下文菜单，提供自定义根级右键菜单 */}
                    <Dropdown menu={{ items: rootContextMenuItems }} trigger={["contextMenu"]}>
                        <div
                            className="max-h-80 min-h-[160px] space-y-1 overflow-y-auto rounded-lg border border-stone-200/80 p-1.5 dark:border-stone-800"
                            onContextMenu={(e) => {
                                e.preventDefault();
                            }}
                        >
                            <FolderChoice
                                active={selectedId === null}
                                label={t("canvas.picPocketSave.inbox")}
                                onClick={() => setSelectedId(null)}
                            />

                            <PocketFolderTree
                                folders={folders}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                onCreateSubFolder={(folder) => handleOpenCreate(folder.id)}
                                onRenameFolder={handleOpenRename}
                                onDeleteFolder={handleDeleteFolder}
                            />
                        </div>
                    </Dropdown>
                </div>
            </Modal>

            {/* 新建 / 重命名 文件夹弹窗 */}
            <Modal
                title={
                    folderModalState.mode === "create"
                        ? folderModalState.parentId
                            ? t("canvas.picPocketAssets.newSubFolder")
                            : t("canvas.picPocketAssets.newFolder")
                        : t("canvas.picPocketAssets.renameFolder")
                }
                open={folderModalState.open}
                destroyOnClose
                onCancel={() => setFolderModalState((s) => ({ ...s, open: false }))}
                onOk={handleConfirmFolderModal}
            >
                <div className="pt-3">
                    <Input
                        autoFocus
                        placeholder={t("canvas.picPocketAssets.folderNamePlaceholder")}
                        value={folderModalState.name}
                        onChange={(e) => setFolderModalState((s) => ({ ...s, name: e.target.value }))}
                        onPressEnter={handleConfirmFolderModal}
                    />
                </div>
            </Modal>
        </>
    );
}

function FolderChoice({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                active ? "bg-violet-600 text-white" : "hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
        >
            <Inbox className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}
