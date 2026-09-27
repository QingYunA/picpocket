import React, { useState, useRef, useEffect } from 'react';
import { Trash2, GripHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTextNote, TextNoteColor, CanvasTheme } from '../types';

interface CanvasTextCardProps {
  note: CanvasTextNote;
  theme: CanvasTheme;
  scale: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onChangeText: (id: string, text: string) => void;
  onChangeColor: (id: string, color: TextNoteColor) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}

const COLOR_MAP: Record<
  TextNoteColor,
  { light: string; dark: string; dot: string }
> = {
  yellow: {
    light: 'bg-amber-50 border-amber-200/90 text-amber-950 shadow-amber-200/40',
    dark: 'bg-amber-950/40 border-amber-700/60 text-amber-100 shadow-black/60',
    dot: 'bg-amber-400',
  },
  blue: {
    light: 'bg-sky-50 border-sky-200/90 text-sky-950 shadow-sky-200/40',
    dark: 'bg-sky-950/40 border-sky-700/60 text-sky-100 shadow-black/60',
    dot: 'bg-sky-400',
  },
  green: {
    light: 'bg-emerald-50 border-emerald-200/90 text-emerald-950 shadow-emerald-200/40',
    dark: 'bg-emerald-950/40 border-emerald-700/60 text-emerald-100 shadow-black/60',
    dot: 'bg-emerald-400',
  },
  pink: {
    light: 'bg-rose-50 border-rose-200/90 text-rose-950 shadow-rose-200/40',
    dark: 'bg-rose-950/40 border-rose-700/60 text-rose-100 shadow-black/60',
    dot: 'bg-rose-400',
  },
  zinc: {
    light: 'bg-white border-slate-200 text-slate-900 shadow-slate-200/40',
    dark: 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-black/60',
    dot: 'bg-zinc-400',
  },
};

export const CanvasTextCard: React.FC<CanvasTextCardProps> = ({
  note,
  theme,
  scale,
  isSelected,
  onSelect,
  onChangeText,
  onChangeColor,
  onDelete,
  onMove,
}) => {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: note.x,
    initY: note.y,
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(72, textareaRef.current.scrollHeight)}px`;
    }
  }, [note.text]);

  // 新建或选中空便签时自动聚焦输入框
  useEffect(() => {
    if (isSelected && note.text === '' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isSelected]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onSelect?.();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: note.x,
      initY: note.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStartRef.current.startX) / scale;
    const dy = (e.clientY - dragStartRef.current.startY) / scale;
    onMove(note.id, Math.round(dragStartRef.current.initX + dx), Math.round(dragStartRef.current.initY + dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const colorStyle = COLOR_MAP[note.color || 'yellow'];
  const isLight = theme === 'light';
  const cardColorClass = isLight ? colorStyle.light : colorStyle.dark;

  return (
    <div
      data-canvas-card
      className={`absolute w-72 rounded-xl border p-3 shadow-xl backdrop-blur-md transition-shadow select-none group ${cardColorClass} ${
        isSelected ? 'ring-2 ring-violet-500 shadow-violet-500/20' : ''
      }`}
      style={{
        transform: `translate(${note.x}px, ${note.y}px)`,
        zIndex: isDragging ? 40 : 15,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {/* 拖动手柄与操作栏 */}
      <div
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing border-b border-black/5 dark:border-white/5"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
          <GripHorizontal className="w-4 h-4" />
          <span className="text-[11px] font-medium">{t('workbench.addTextNote')}</span>
        </div>

        <div className="flex items-center gap-1.5" data-canvas-no-pan>
          {/* 调色板 */}
          {(['yellow', 'blue', 'green', 'pink', 'zinc'] as TextNoteColor[]).map((c) => (
            <button
              key={c}
              onClick={(e) => {
                e.stopPropagation();
                onChangeColor(note.id, c);
              }}
              className={`w-3 h-3 rounded-full ${COLOR_MAP[c].dot} transition-transform hover:scale-125 ${
                (note.color || 'yellow') === c ? 'ring-1 ring-offset-1 ring-black/40 dark:ring-white/60 scale-110' : 'opacity-60'
              }`}
            />
          ))}

          {/* 删除按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            title={t('workbench.deleteNote')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-all text-red-500 ml-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 文本编写区域 */}
      <div className="pt-2" data-canvas-no-pan>
        <textarea
          ref={textareaRef}
          value={note.text}
          onChange={(e) => onChangeText(note.id, e.target.value)}
          placeholder={t('workbench.textNotePlaceholder')}
          rows={3}
          className="w-full bg-transparent resize-none outline-none text-xs leading-relaxed font-sans placeholder:opacity-50"
        />
      </div>
    </div>
  );
};
