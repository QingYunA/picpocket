import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Edit2, Trash2, Check, X, Layers } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasProject, CanvasTheme } from '../types';

export interface CanvasProjectDropdownProps {
  projects: CanvasProject[];
  activeProjectId: string;
  theme: CanvasTheme;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onDeleteProject: (id: string) => void;
}

export const CanvasProjectDropdown: React.FC<CanvasProjectDropdownProps> = ({
  projects,
  activeProjectId,
  theme,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
        setDeletingId(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (project: CanvasProject, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(project.id);
    setEditTitle(project.title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameProject(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDownRename = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSaveRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div ref={dropdownRef} className="relative pointer-events-auto">
      {/* 顶栏画板选择触发器 */}
      <div className="flex items-center gap-1">
        {editingId === activeProject?.id ? (
          <div className="flex items-center gap-1">
            <input
              ref={editInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => handleSaveRename(activeProject.id)}
              onKeyDown={(e) => handleKeyDownRename(e, activeProject.id)}
              className={`text-xs sm:text-sm font-semibold px-2 py-0.5 rounded-lg border outline-hidden ${
                isLight
                  ? 'bg-white border-violet-500 text-slate-800'
                  : 'bg-zinc-900 border-violet-500 text-zinc-100'
              }`}
            />
            <button
              onClick={() => handleSaveRename(activeProject.id)}
              className="p-1 rounded-md text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            onDoubleClick={(e) => activeProject && handleStartRename(activeProject, e)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer group ${
              isLight
                ? 'hover:bg-slate-100 text-slate-800'
                : 'hover:bg-zinc-800/80 text-zinc-100'
            }`}
            title={activeProject?.title}
          >
            <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="max-w-[140px] sm:max-w-[180px] truncate">
              {activeProject?.title || t('workbench.projects')}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>

      {/* 下拉面板 */}
      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-2 w-[280px] max-w-[calc(100vw-24px)] p-2 rounded-2xl border shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150 select-none ${
            isLight
              ? 'bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-300/60'
              : 'bg-zinc-900/95 border-zinc-800/90 text-zinc-100 shadow-black/80'
          }`}
        >
          <div className="px-2 py-1 text-[10px] font-mono tracking-wider uppercase opacity-40 border-b border-inherit/40 mb-1 flex items-center justify-between">
            <span>{t('workbench.projects')}</span>
            <span>{projects.length}</span>
          </div>

          {/* 画板列表 */}
          <div className="max-h-[260px] overflow-y-auto space-y-1 py-1 thin-scrollbar">
            {projects.map((proj) => {
              const isActive = proj.id === activeProjectId;
              const isDeletingThis = deletingId === proj.id;
              const isEditingThis = editingId === proj.id;
              const cardCount = proj.cards?.length || 0;

              if (isDeletingThis) {
                return (
                  <div
                    key={proj.id}
                    className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-xs space-y-1.5 animate-in fade-in duration-150"
                  >
                    <div className="text-[11px] text-red-500 leading-tight">
                      {t('workbench.deleteProjectConfirm')}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-0.5 text-[10px] rounded-md opacity-70 hover:opacity-100 cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => {
                          onDeleteProject(proj.id);
                          setDeletingId(null);
                        }}
                        className="px-2 py-0.5 text-[10px] rounded-md bg-red-600 text-white font-medium cursor-pointer shadow-xs"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    if (!isEditingThis) {
                      onSelectProject(proj.id);
                      setIsOpen(false);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartRename(proj, e);
                  }}
                  className={`group flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    isActive
                      ? isLight
                        ? 'bg-violet-50 text-violet-900 font-semibold border border-violet-200'
                        : 'bg-violet-950/40 text-violet-200 font-semibold border border-violet-800/50'
                      : isLight
                      ? 'hover:bg-slate-100 text-slate-700'
                      : 'hover:bg-zinc-800/70 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isActive ? (
                      <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 shrink-0" />
                    )}

                    {isEditingThis ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleSaveRename(proj.id)}
                        onKeyDown={(e) => handleKeyDownRename(e, proj.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs px-1.5 py-0.5 rounded border outline-hidden flex-1 ${
                          isLight
                            ? 'bg-white border-violet-500 text-slate-800'
                            : 'bg-zinc-800 border-violet-500 text-zinc-100'
                        }`}
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{proj.title}</div>
                        <div className="text-[10px] opacity-45 font-mono">
                          {t('workbench.cardCountBadge', { count: cardCount })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 快捷操作按钮 */}
                  {!isEditingThis && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button
                        onClick={(e) => handleStartRename(proj, e)}
                        className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        title={t('workbench.renameProject')}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(proj.id);
                        }}
                        className="p-1 rounded-md opacity-60 hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title={t('workbench.deleteProject')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 底部新建画板按钮 */}
          <div className="pt-2 mt-1 border-t border-inherit/40">
            <button
              type="button"
              onClick={() => {
                onCreateProject();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md transition-all cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('workbench.newProject')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
