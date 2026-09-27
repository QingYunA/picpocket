import React, { useState } from 'react';
import { Compass, Focus, HelpCircle, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTheme } from '../types';

export interface CanvasZoomControlsProps {
  scale: number;
  theme: CanvasTheme;
  isMiniMapOpen: boolean;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
  onToggleMiniMap: () => void;
}

export const CanvasZoomControls: React.FC<CanvasZoomControlsProps> = ({
  scale,
  theme,
  isMiniMapOpen,
  onScaleChange,
  onReset,
  onToggleMiniMap,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const dockStyle = isLight
    ? 'bg-white/90 border-slate-200 text-slate-700 shadow-slate-300/60'
    : 'bg-[#18181b]/90 border-zinc-800 text-zinc-300 shadow-black/80';

  const itemActiveStyle = 'bg-[#2f80ff] text-white';
  const itemHoverStyle = isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-zinc-100';

  return (
    <div
      className="absolute bottom-5 left-5 z-50 select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={`flex h-14 items-center gap-1.5 rounded-2xl border px-3 shadow-2xl backdrop-blur-xl ${dockStyle}`}
      >
        {/* 小地图开关 */}
        <button
          type="button"
          onClick={onToggleMiniMap}
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all cursor-pointer ${
            isMiniMapOpen ? itemActiveStyle : itemHoverStyle
          }`}
          title={isMiniMapOpen ? t('workbench.miniMapClose') : t('workbench.miniMapOpen')}
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* 复位 100% 居中 */}
        <button
          type="button"
          onClick={onReset}
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all cursor-pointer ${itemHoverStyle}`}
          title={t('workbench.resetZoom')}
        >
          <Focus className="w-4 h-4" />
        </button>

        {/* 5% ~ 500% 连续缩放滑块 */}
        <input
          type="range"
          min="5"
          max="500"
          step="1"
          value={Math.round(scale * 100)}
          onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
          className="w-20 sm:w-24 accent-[#2f80ff] cursor-pointer"
          title={t('workbench.zoomIn')}
        />

        {/* 缩放数值 */}
        <span className="w-12 text-right text-xs font-mono opacity-70">
          {Math.round(scale * 100)}%
        </span>

        {/* 快捷键帮助 */}
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all cursor-pointer ${
            shortcutsOpen ? itemActiveStyle : itemHoverStyle
          }`}
          title={t('workbench.shortcutsTitle')}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* 快捷键帮助模态框 */}
      {shortcutsOpen && (
        <div
          data-canvas-no-pan="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all animate-in fade-in zoom-in-95 ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#18181b] border-zinc-800 text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit/40 mb-4">
              <h3 className="text-base font-semibold">{t('workbench.shortcutsTitle')}</h3>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <ShortcutRow label="V / H" desc={t('workbench.shortcutSelectPan')} />
              <ShortcutRow label="Space + 拖拽 / 鼠标中键" desc={t('workbench.shortcutSpacePan')} />
              <ShortcutRow label="空白处左键拖拽" desc={t('workbench.shortcutMarquee')} />
              <ShortcutRow label="Shift + 单击" desc={t('workbench.shortcutShiftSelect')} />
              <ShortcutRow label="双指上下滑 / 滚轮" desc={t('workbench.shortcutSmoothZoom')} />
              <ShortcutRow label="Cmd / Ctrl + Enter" desc={t('workbench.shortcutGenerate')} />
              <ShortcutRow label="Cmd / Ctrl + 0" desc={t('workbench.shortcutReset100')} />
              <ShortcutRow label="Delete / Backspace" desc={t('workbench.shortcutDeleteNodes')} />
              <ShortcutRow label="Esc" desc={t('workbench.shortcutEscCancel')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ShortcutRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-inherit/20 last:border-0">
      <span className="font-mono font-medium px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
        {label}
      </span>
      <span className="opacity-70">{desc}</span>
    </div>
  );
}
