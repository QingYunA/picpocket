import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  Plus,
  Inbox,
  Check,
  X,
  Layers,
  CheckSquare,
  Search,
} from 'lucide-react';
import { db, createFolder, renameFolder, deleteFolder, moveItemToFolder, batchMoveItemsToFolder } from '@/db';
import type { FolderItem, FolderFilter } from '@/types';
import { useI18n } from '@/i18n';
import { ConfirmModal } from './ConfirmModal';

export interface FolderTreeNode extends FolderItem {
  children: FolderTreeNode[];
}

interface FolderNavProps {
  selectedFolderId: FolderFilter;
  onSelectFolder: (id: FolderFilter) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  onBatchMoved?: () => void;
  isBatchMode?: boolean;
  onToggleBatchMode?: () => void;
  showSearch?: boolean;
  onToggleSearch?: () => void;
}

interface FolderTreeItemProps {
  node: FolderTreeNode;
  depth: number;
  selectedFolderId: FolderFilter;
  expandedFolderIds: Set<number>;
  folderCounts: Record<number, number>;
  dragOverFolderId: number | null | 'uncategorized';
  editingFolderId: number | null;
  editName: string;
  creatingSubParentId: number | null;
  newSubName: string;
  onSelectFolder: (id: FolderFilter) => void;
  toggleExpand: (id: number, e?: React.MouseEvent) => void;
  onDropOnFolder: (e: React.DragEvent, targetFolderId: number | null) => void;
  setDragOverFolderId: (id: number | null | 'uncategorized') => void;
  setCreatingSubParentId: (id: number | null) => void;
  setNewSubName: (name: string) => void;
  handleCreateSub: (parentId: number) => void;
  setEditingFolderId: (id: number | null) => void;
  setEditName: (name: string) => void;
  handleRename: (id: number) => void;
  handleDelete: (id: number, e: React.MouseEvent) => void;
  t: (key: any) => string;
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({
  node,
  depth,
  selectedFolderId,
  expandedFolderIds,
  folderCounts,
  dragOverFolderId,
  editingFolderId,
  editName,
  creatingSubParentId,
  newSubName,
  onSelectFolder,
  toggleExpand,
  onDropOnFolder,
  setDragOverFolderId,
  setCreatingSubParentId,
  setNewSubName,
  handleCreateSub,
  setEditingFolderId,
  setEditName,
  handleRename,
  handleDelete,
  t,
}) => {
  const isSelected = selectedFolderId === node.id;
  const isExpanded = expandedFolderIds.has(node.id!);
  const count = folderCounts[node.id!] || 0;
  const isDragOver = dragOverFolderId === node.id;

  return (
    <div className="space-y-0.5">
      <div
        onClick={() => onSelectFolder(node.id!)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolderId(node.id!);
        }}
        onDragLeave={() => setDragOverFolderId(null)}
        onDrop={(e) => onDropOnFolder(e, node.id!)}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={`group relative flex items-center justify-between rounded-md py-1 pr-2 text-xs transition-colors cursor-pointer ${
          isSelected
            ? 'bg-zinc-900 text-white font-semibold shadow-2xs'
            : isDragOver
            ? 'bg-amber-100 border border-amber-300 text-amber-900 font-medium'
            : 'text-zinc-700 hover:bg-zinc-200/60'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {node.children.length > 0 ? (
            <button
              onClick={(e) => toggleExpand(node.id!, e)}
              className="text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-3.5" />
          )}

          {isSelected ? (
            <FolderOpen className="h-3.5 w-3.5 text-amber-400 fill-amber-400/30 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
          )}

          {editingFolderId === node.id ? (
            <input
              type="text"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(node.id!);
                if (e.key === 'Escape') setEditingFolderId(null);
              }}
              onBlur={() => handleRename(node.id!)}
              className="flex-1 bg-white text-zinc-900 text-xs px-1 rounded border border-amber-400 outline-none"
            />
          ) : (
            <span className="truncate text-xs">{node.name}</span>
          )}
        </div>

        {/* Count & Hover Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-mono ${isSelected ? 'text-zinc-400' : 'text-zinc-400'}`}>
            {count}
          </span>

          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!expandedFolderIds.has(node.id!)) {
                  toggleExpand(node.id!);
                }
                setNewSubName('');
                setCreatingSubParentId(node.id!);
              }}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-300/50 hover:text-zinc-800 cursor-pointer"
              title={t('folders.newSubFolder')}
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingFolderId(node.id!);
                setEditName(node.name);
              }}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-300/50 hover:text-zinc-800 cursor-pointer"
              title={t('folders.rename')}
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => handleDelete(node.id!, e)}
              className="rounded p-0.5 text-zinc-400 hover:bg-red-100 hover:text-red-600 cursor-pointer"
              title={t('folders.delete')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Subfolder Creation Inline Input */}
      {creatingSubParentId === node.id && (
        <div
          style={{ marginLeft: `${depth * 12 + 18}px` }}
          className="flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2 py-0.5 shadow-2xs mr-2"
        >
          <Folder className="h-3 w-3 text-amber-500" />
          <input
            type="text"
            autoFocus
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSub(node.id!);
              if (e.key === 'Escape') setCreatingSubParentId(null);
            }}
            placeholder={t('folders.namePlaceholder')}
            className="flex-1 text-xs text-zinc-900 outline-none bg-transparent"
          />
          <button
            onClick={() => handleCreateSub(node.id!)}
            className="text-emerald-600 hover:text-emerald-700 cursor-pointer p-0.5"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => setCreatingSubParentId(null)}
            className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Recursive Children Rendering */}
      {isExpanded && node.children.length > 0 && (
        <div className="border-l border-zinc-200/80 ml-3 space-y-0.5">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              expandedFolderIds={expandedFolderIds}
              folderCounts={folderCounts}
              dragOverFolderId={dragOverFolderId}
              editingFolderId={editingFolderId}
              editName={editName}
              creatingSubParentId={creatingSubParentId}
              newSubName={newSubName}
              onSelectFolder={onSelectFolder}
              toggleExpand={toggleExpand}
              onDropOnFolder={onDropOnFolder}
              setDragOverFolderId={setDragOverFolderId}
              setCreatingSubParentId={setCreatingSubParentId}
              setNewSubName={setNewSubName}
              handleCreateSub={handleCreateSub}
              setEditingFolderId={setEditingFolderId}
              setEditName={setEditName}
              handleRename={handleRename}
              handleDelete={handleDelete}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FolderNav: React.FC<FolderNavProps> = ({
  selectedFolderId,
  onSelectFolder,
  isOpen,
  onToggleOpen,
  onBatchMoved,
  isBatchMode,
  onToggleBatchMode,
  showSearch,
  onToggleSearch,
}) => {
  const { t } = useI18n();

  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray()) || [];
  const items = useLiveQuery(() => db.items.toArray()) || [];

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<number>>(new Set());
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const [creatingSubParentId, setCreatingSubParentId] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null | 'uncategorized'>(null);

  // Calculate item counts per folder
  const { uncategorizedCount, folderCounts } = useMemo(() => {
    let uncat = 0;
    const counts: Record<number, number> = {};
    items.forEach((item) => {
      if (item.folderId == null) {
        uncat++;
      } else {
        counts[item.folderId] = (counts[item.folderId] || 0) + 1;
      }
    });
    return { uncategorizedCount: uncat, folderCounts: counts };
  }, [items]);

  // Build recursive multi-level folder hierarchy tree
  const folderTree = useMemo(() => {
    const map = new Map<number, FolderTreeNode>();
    folders.forEach((f) => {
      if (f.id != null) {
        map.set(f.id, { ...f, children: [] });
      }
    });

    const roots: FolderTreeNode[] = [];
    folders.forEach((f) => {
      if (f.id != null) {
        const node = map.get(f.id)!;
        if (f.parentId != null && map.has(f.parentId)) {
          map.get(f.parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  }, [folders]);

  const toggleExpand = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateRoot = async () => {
    if (!newRootName.trim()) {
      setIsCreatingRoot(false);
      return;
    }
    try {
      const id = await createFolder(newRootName.trim());
      setIsCreatingRoot(false);
      setNewRootName('');
      onSelectFolder(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSub = async (parentId: number) => {
    if (!newSubName.trim()) {
      setCreatingSubParentId(null);
      return;
    }
    try {
      const id = await createFolder(newSubName.trim(), parentId);
      setCreatingSubParentId(null);
      setNewSubName('');
      setExpandedFolderIds((prev) => new Set(prev).add(parentId));
      onSelectFolder(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) {
      setEditingFolderId(null);
      return;
    }
    try {
      await renameFolder(id, editName.trim());
      setEditingFolderId(null);
      setEditName('');
    } catch (err) {
      console.error(err);
    }
  };

  const [folderToDelete, setFolderToDelete] = useState<number | null>(null);

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderToDelete(id);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await deleteFolder(folderToDelete);
      if (selectedFolderId === folderToDelete) {
        onSelectFolder('all');
      }
    } catch (err) {
      console.error('Failed to delete folder:', err);
    } finally {
      setFolderToDelete(null);
    }
  };

  const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;

    try {
      if (dataStr.startsWith('[') && dataStr.endsWith(']')) {
        const ids: number[] = JSON.parse(dataStr);
        if (Array.isArray(ids) && ids.length > 0) {
          await batchMoveItemsToFolder(ids, targetFolderId);
          onBatchMoved?.();
          return;
        }
      }
    } catch {}

    const itemId = parseInt(dataStr, 10);
    if (!isNaN(itemId)) {
      await moveItemToFolder(itemId, targetFolderId);
    }
  };

  return (
    <div className="border-b border-zinc-200/80 bg-zinc-50/70 select-none">
      {/* Folder Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <button
          onClick={onToggleOpen}
          className="flex items-center gap-1.5 font-semibold text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <Folder className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" />
          <span>{t('folders.title')}</span>
          <span className="rounded-full bg-zinc-200/60 px-1.5 py-0.2 text-[10px] font-mono text-zinc-600">
            {folders.length}
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleSearch && (
            <button
              onClick={onToggleSearch}
              className={`flex h-6 w-6 items-center justify-center rounded border transition-colors cursor-pointer shrink-0 ${
                showSearch
                  ? 'border-zinc-300 bg-zinc-200/90 text-zinc-900 shadow-2xs font-semibold'
                  : 'border-zinc-200/70 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 shadow-2xs'
              }`}
              title={t('header.search')}
            >
              <Search className="h-3 w-3" />
            </button>
          )}

          {onToggleBatchMode && (
            <button
              onClick={onToggleBatchMode}
              className={`flex h-6 w-6 items-center justify-center rounded border transition-colors cursor-pointer shrink-0 ${
                isBatchMode
                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                  : 'border-zinc-200/70 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 shadow-2xs'
              }`}
              title={t('batch.enterBatch')}
            >
              <CheckSquare className="h-3 w-3" />
            </button>
          )}

          <button
            onClick={() => {
              if (!isOpen) {
                onToggleOpen();
              }
              setNewRootName('');
              setIsCreatingRoot(true);
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors cursor-pointer border border-zinc-200/70 bg-white shadow-2xs shrink-0"
            title={t('folders.newFolder')}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden min-[360px]:inline">{t('folders.newFolder')}</span>
          </button>
        </div>
      </div>

      {/* Expanded Folder Tree Drawer */}
      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-0.5 animate-in fade-in duration-150">
          {/* Top Quick Sinks: All & Uncategorized */}
          <div className="grid grid-cols-2 gap-1 mb-1.5">
            <button
              onClick={() => onSelectFolder('all')}
              className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition-all cursor-pointer ${
                selectedFolderId === 'all'
                  ? 'bg-zinc-900 text-white font-semibold shadow-2xs'
                  : 'bg-white text-zinc-700 border border-zinc-200/70 hover:bg-zinc-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Layers className="h-3 w-3" />
                <span>{t('folders.all')}</span>
              </div>
              <span className={`text-[10px] font-mono ${selectedFolderId === 'all' ? 'text-zinc-400' : 'text-zinc-400'}`}>
                {items.length}
              </span>
            </button>

            <button
              onClick={() => onSelectFolder('uncategorized')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverFolderId('uncategorized');
              }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(e) => handleDropOnFolder(e, null)}
              className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition-all cursor-pointer ${
                selectedFolderId === 'uncategorized'
                  ? 'bg-zinc-900 text-white font-semibold shadow-2xs'
                  : dragOverFolderId === 'uncategorized'
                  ? 'bg-amber-100 border border-amber-300 text-amber-900 font-semibold'
                  : 'bg-white text-zinc-700 border border-zinc-200/70 hover:bg-zinc-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Inbox className="h-3 w-3" />
                <span>{t('folders.uncategorized')}</span>
              </div>
              <span className={`text-[10px] font-mono ${selectedFolderId === 'uncategorized' ? 'text-zinc-400' : 'text-zinc-400'}`}>
                {uncategorizedCount}
              </span>
            </button>
          </div>

          {/* New Root Folder Inline Input */}
          {isCreatingRoot && (
            <div className="flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2 py-1 shadow-xs">
              <Folder className="h-3.5 w-3.5 text-amber-500" />
              <input
                type="text"
                autoFocus
                value={newRootName}
                onChange={(e) => setNewRootName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateRoot();
                  if (e.key === 'Escape') setIsCreatingRoot(false);
                }}
                placeholder={t('folders.namePlaceholder')}
                className="flex-1 text-xs text-zinc-900 outline-none bg-transparent"
              />
              <button
                onClick={handleCreateRoot}
                className="text-emerald-600 hover:text-emerald-700 cursor-pointer p-0.5"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsCreatingRoot(false)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Recursive Multi-Level Folder Tree List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
            {folderTree.map((rootNode) => (
              <FolderTreeItem
                key={rootNode.id}
                node={rootNode}
                depth={0}
                selectedFolderId={selectedFolderId}
                expandedFolderIds={expandedFolderIds}
                folderCounts={folderCounts}
                dragOverFolderId={dragOverFolderId}
                editingFolderId={editingFolderId}
                editName={editName}
                creatingSubParentId={creatingSubParentId}
                newSubName={newSubName}
                onSelectFolder={onSelectFolder}
                toggleExpand={toggleExpand}
                onDropOnFolder={handleDropOnFolder}
                setDragOverFolderId={setDragOverFolderId}
                setCreatingSubParentId={setCreatingSubParentId}
                setNewSubName={setNewSubName}
                handleCreateSub={handleCreateSub}
                setEditingFolderId={setEditingFolderId}
                setEditName={setEditName}
                handleRename={handleRename}
                handleDelete={handleDelete}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* In-App Folder Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={folderToDelete !== null}
        title={t('folders.delete')}
        description={t('folders.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        isDestructive={true}
        onConfirm={handleConfirmDeleteFolder}
        onClose={() => setFolderToDelete(null)}
      />
    </div>
  );
};
