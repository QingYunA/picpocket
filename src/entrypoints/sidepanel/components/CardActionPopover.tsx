import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Folder,
  Inbox,
  Search,
  Check,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { db } from '@/db';
import type { FolderItem } from '@/types';
import { useI18n } from '@/i18n';

interface FolderTreeNode extends FolderItem {
  children: FolderTreeNode[];
}

interface CardActionPopoverProps {
  currentFolderId?: number | null;
  onSelectFolder: (folderId: number | null) => void;
  onClose: () => void;
  title?: string;
}

export const CardActionPopover: React.FC<CardActionPopoverProps> = ({
  currentFolderId,
  onSelectFolder,
  onClose,
  title,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray()) || [];
  const items = useLiveQuery(() => db.items.toArray()) || [];

  // Count items per folder
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

  // Build folder hierarchy tree
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

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Flatten tree with filter
  const renderFolderItem = (node: FolderTreeNode, depth: number) => {
    const matchesSearch =
      !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
    const isCurrent = currentFolderId === node.id;
    const count = folderCounts[node.id!] || 0;

    return (
      <React.Fragment key={node.id}>
        {matchesSearch && (
          <button
            onClick={() => {
              onSelectFolder(node.id!);
              onClose();
            }}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className={`flex w-full items-center justify-between rounded-lg py-1.5 pr-2.5 text-xs transition-colors cursor-pointer text-left ${
              isCurrent
                ? 'bg-zinc-100 font-semibold text-zinc-900'
                : 'text-zinc-700 hover:bg-zinc-100/80'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Folder className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
              <span className="truncate">{node.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <span className="text-[10px] font-mono text-zinc-400">{count}</span>
              {isCurrent && <Check className="h-3.5 w-3.5 text-emerald-600 ml-1" />}
            </div>
          </button>
        )}
        {node.children.map((child) => renderFolderItem(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div
      ref={popoverRef}
      style={{
        zIndex: 50,
      }}
      className="w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-100">
        <span className="text-xs font-semibold text-zinc-800">
          {title || t('cardMenu.moveToFolder')}
        </span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer rounded"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search Filter */}
      {folders.length > 4 && (
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-2 h-3 w-3 text-zinc-400" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('cardMenu.searchFolderPlaceholder')}
            className="w-full rounded-md border border-zinc-200 bg-zinc-50/60 pl-6 pr-2 py-1 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-800 focus:bg-white focus:outline-none"
          />
        </div>
      )}

      {/* Folders List */}
      <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
        {/* Uncategorized (Inbox) Destination */}
        {(!searchQuery ||
          t('folders.uncategorized').toLowerCase().includes(searchQuery.toLowerCase())) && (
          <button
            onClick={() => {
              onSelectFolder(null);
              onClose();
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer text-left ${
              currentFolderId == null
                ? 'bg-zinc-100 font-semibold text-zinc-900'
                : 'text-zinc-700 hover:bg-zinc-100/80'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Inbox className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <span>{t('folders.uncategorized')}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <span className="text-[10px] font-mono text-zinc-400">{uncategorizedCount}</span>
              {currentFolderId == null && <Check className="h-3.5 w-3.5 text-emerald-600 ml-1" />}
            </div>
          </button>
        )}

        {/* User Folders */}
        {folderTree.map((root) => renderFolderItem(root, 0))}
      </div>
    </div>
  );
};
