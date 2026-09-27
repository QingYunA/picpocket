import React, { useEffect } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full max-w-[300px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl animate-in zoom-in-95 duration-150 space-y-3"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-2xs ${
              isDestructive
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}
          >
            {isDestructive ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="text-xs font-bold text-zinc-900 leading-tight">
              {title}
            </h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed break-words">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 bg-white py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer text-center"
          >
            {cancelText || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer text-center ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {confirmText || (isDestructive ? t('common.delete') : t('common.ok'))}
          </button>
        </div>
      </div>
    </div>
  );
};
