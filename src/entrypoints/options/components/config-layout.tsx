import React from 'react';

interface ConfigLayoutProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const ConfigLayout: React.FC<ConfigLayoutProps> = ({
  title,
  description,
  actions,
  children,
}) => {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-zinc-500 leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">{children}</div>
    </div>
  );
};
