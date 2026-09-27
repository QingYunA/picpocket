import React from 'react';

export interface EntityListItem {
  id: string;
  name: string;
  subtitle?: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  tag?: string;
  badgeColor?: string;
}

interface EntityEditorLayoutProps {
  items: EntityListItem[];
  selectedId: string;
  onSelectId: (id: string) => void;
  railTitle?: string;
  railAction?: React.ReactNode;
  children: React.ReactNode;
}

export const EntityEditorLayout: React.FC<EntityEditorLayoutProps> = ({
  items,
  selectedId,
  onSelectId,
  railTitle,
  railAction,
  children,
}) => {
  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Left List Rail (Master) */}
      <div className="w-full lg:w-72 shrink-0 space-y-3">
        {(railTitle || railAction) && (
          <div className="flex items-center justify-between px-1">
            {railTitle && (
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {railTitle}
              </span>
            )}
            {railAction}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5 p-1.5 bg-zinc-100/70 rounded-2xl border border-zinc-200/60">
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectId(item.id)}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80 font-medium'
                    : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.icon && (
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                        isSelected ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-200/60 text-zinc-600'
                      }`}
                    >
                      {item.icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">{item.name}</span>
                      {item.isActive && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.subtitle}</p>
                    )}
                  </div>
                </div>

                {item.tag && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 ${
                      item.badgeColor || 'bg-zinc-100 text-zinc-600 border border-zinc-200/60'
                    }`}
                  >
                    {item.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Detail Area (Detail) */}
      <div className="w-full min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
};
