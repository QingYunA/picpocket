import React from 'react';

interface ConfigItemProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  id?: string;
}

export const ConfigItem: React.FC<ConfigItemProps> = ({
  title,
  description,
  icon,
  badge,
  action,
  orientation = 'horizontal',
  children,
  className = '',
  highlight = false,
  id,
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      id={id}
      className={`py-3.5 transition-all duration-300 ${
        highlight ? 'bg-amber-50/70 -mx-5 px-5 rounded-lg ring-2 ring-amber-400' : ''
      } ${
        isHorizontal
          ? 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6'
          : 'flex flex-col gap-2'
      } ${className}`}
    >
      <div className={isHorizontal ? 'min-w-0 sm:min-w-[180px] flex-1' : 'w-full'}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
            <label className="text-xs font-semibold text-zinc-900 tracking-tight">{title}</label>
            {badge}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {description && (
          <div className="mt-1 text-xs text-zinc-500 leading-relaxed max-w-2xl">{description}</div>
        )}
      </div>
      <div
        className={
          isHorizontal
            ? 'flex items-center sm:justify-end gap-3 shrink-0 max-w-full'
            : 'w-full pt-0.5'
        }
      >
        {children}
      </div>
    </div>
  );
};
