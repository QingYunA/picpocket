import React from 'react';
import {
  FolderInput,
  Trash2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { useI18n } from '@/i18n';

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onOpenBatchMove: (e: React.MouseEvent) => void;
  onBatchDelete: () => void;
  onExit: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onOpenBatchMove,
  onBatchDelete,
  onExit,
}) => {
  const { t } = useI18n();
  const isAllSelected = selectedCount > 0 && selectedCount >= totalCount;

  return (
    <div className="absolute bottom-9 left-2.5 right-2.5 z-30 flex items-center justify-between rounded-xl border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Selection Summary */}
      <div className="flex items-center gap-2">
        <button
          onClick={isAllSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
          title={isAllSelected ? t('batch.deselectAll') : t('batch.selectAll')}
        >
          {isAllSelected ? (
            <CheckSquare className="h-4 w-4 text-sky-400" />
          ) : (
            <Square className="h-4 w-4 text-zinc-400" />
          )}
          <span className="font-mono text-xs">{t('batch.selectedCount', { count: selectedCount })}</span>
        </button>
      </div>

      {/* Batch Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          disabled={selectedCount === 0}
          onClick={onOpenBatchMove}
          className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          title={t('batch.batchMove')}
        >
          <FolderInput className="h-3.5 w-3.5 text-amber-400" />
          <span>{t('batch.batchMove')}</span>
        </button>

        <button
          disabled={selectedCount === 0}
          onClick={onBatchDelete}
          className="flex items-center gap-1 rounded-lg bg-zinc-800/80 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          title={t('batch.batchDelete')}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
          <span className="hidden min-[360px]:inline">{t('batch.batchDelete')}</span>
        </button>

        <button
          onClick={onExit}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          title={t('batch.exit')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
