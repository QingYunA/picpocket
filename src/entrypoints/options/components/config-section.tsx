import React from 'react';

interface ConfigSectionProps {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  description,
  badge,
  icon,
  actions,
  children,
  className = '',
}) => {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white shadow-2xs overflow-hidden ${className}`}
    >
      {(title || description || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-start sm:items-center gap-2.5">
            {icon && <div className="text-zinc-500 shrink-0 mt-0.5 sm:mt-0">{icon}</div>}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
                {badge}
              </div>
              {description && (
                <p className="mt-0.5 text-xs text-zinc-500 leading-normal">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className="divide-y divide-zinc-100 px-5">{children}</div>
    </div>
  );
};
