import React from 'react';
import { Logo } from '@/components/Logo';
import { NAV_GROUPS } from './navigation/nav-items';
import { useI18n } from '@/i18n';
import type { Language } from '@/types';
import { ExternalLink, CheckCircle2 } from 'lucide-react';

interface AppShellProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const { language, setLanguage, t } = useI18n();

  const handleLanguageChange = async (newLang: Language) => {
    await setLanguage(newLang);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0 border-r border-zinc-200/80 bg-white flex flex-col justify-between select-none">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Logo size={28} />
              <div>
                <span className="text-sm font-bold tracking-tight text-zinc-900">PicPocket</span>
                <span className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                  {t('options.nav.consoleTitle')}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Groups */}
          <nav className="p-3 space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.groupKey} className="space-y-1">
                <div className="px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {t(group.groupKey)}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPath === item.path || currentPath.startsWith(item.path + '/');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.path)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'bg-zinc-900 text-white shadow-2xs font-semibold'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                          <span>{t(item.labelKey)}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide ${
                              isActive
                                ? 'bg-zinc-800 text-amber-300 border border-zinc-700'
                                : 'bg-zinc-100 text-zinc-600 border border-zinc-200/80'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-zinc-100 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>PicPocket v1.0.0</span>
            <a
              href="https://github.com/QingYunA/picpocket"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-zinc-700 transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-14 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="font-medium text-zinc-400">PicPocket</span>
            <span>/</span>
            <span className="font-semibold text-zinc-900">{t('options.nav.settingsHub')}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Real-time Storage Sync Notification */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-full border border-emerald-200/60">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>{t('options.sync.autoSynced')}</span>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center p-0.5 bg-zinc-100 rounded-lg border border-zinc-200/80">
              <button
                type="button"
                onClick={() => handleLanguageChange('zh')}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-all cursor-pointer ${
                  language === 'zh'
                    ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                中
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};
