import React from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { useI18n } from '@/i18n';
import type { UserSettings, Language } from '@/types';
import { Languages, MousePointer, BookmarkCheck, Check } from 'lucide-react';

interface GeneralPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  highlightField?: string;
}

export const GeneralPage: React.FC<GeneralPageProps> = ({
  settings,
  onUpdateSettings,
  highlightField,
}) => {
  const { language, setLanguage, t } = useI18n();

  const handleLanguageChange = async (newLang: Language) => {
    await onUpdateSettings((prev) => ({ ...prev, language: newLang }));
    await setLanguage(newLang);
  };

  const handleHoverBadgeToggle = async (enabled: boolean) => {
    await onUpdateSettings((prev) => ({ ...prev, enableHoverBadge: enabled }));
  };

  const handleContextMenuChange = async (mode: 'direct-analyze' | 'direct-collect' | 'dual-menu') => {
    await onUpdateSettings((prev) => ({ ...prev, contextMenuMode: mode }));
  };

  return (
    <ConfigLayout
      title={t('options.general.title')}
      description={t('options.general.description')}
    >
      {/* Language Section */}
      <ConfigSection
        title={t('settings.languageSection')}
        description={t('settings.languageDesc')}
        icon={<Languages className="h-4 w-4" />}
      >
        <ConfigItem
          title={t('settings.languageLabel')}
          description={t('settings.languageDesc')}
          highlight={highlightField === 'language'}
        >
          <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200/60">
            <button
              type="button"
              onClick={() => handleLanguageChange('zh')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                language === 'zh'
                  ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🇨🇳</span>
              <span>{t('settings.langZh')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🇺🇸</span>
              <span>{t('settings.langEn')}</span>
            </button>
          </div>
        </ConfigItem>
      </ConfigSection>

      {/* Web Hover Capsule Section */}
      <ConfigSection
        title={t('options.general.captureTitle')}
        description={t('options.general.captureDesc')}
        icon={<MousePointer className="h-4 w-4" />}
      >
        <ConfigItem
          title={t('settings.hoverBadgeTitle')}
          description={t('settings.hoverBadgeDesc')}
          highlight={highlightField === 'hoverBadge'}
        >
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableHoverBadge ?? true}
              onChange={(e) => handleHoverBadgeToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900" />
          </label>
        </ConfigItem>
      </ConfigSection>

      {/* Context Menu Section */}
      <ConfigSection
        title={t('settings.contextMenuTitle')}
        description={t('settings.contextMenuDesc')}
        icon={<BookmarkCheck className="h-4 w-4" />}
      >
        <ConfigItem
          title={t('options.general.contextModeTitle')}
          description={t('options.general.contextModeDesc')}
          orientation="vertical"
          highlight={highlightField === 'contextMenu'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {[
              {
                mode: 'dual-menu' as const,
                title: t('settings.contextMenuDualMenu'),
                desc: t('options.general.dualMenuDesc'),
                badge: t('options.general.recommendedBadge'),
              },
              {
                mode: 'direct-analyze' as const,
                title: t('settings.contextMenuDirectAnalyze'),
                desc: t('options.general.directAnalyzeDesc'),
              },
              {
                mode: 'direct-collect' as const,
                title: t('settings.contextMenuDirectCollect'),
                desc: t('options.general.directCollectDesc'),
              },
            ].map((option) => {
              const isSelected = (settings.contextMenuMode || 'dual-menu') === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => handleContextMenuChange(option.mode)}
                  className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-zinc-900 bg-zinc-900/5 shadow-2xs'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-bold text-zinc-900">{option.title}</span>
                      {option.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-normal">{option.desc}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ConfigItem>
      </ConfigSection>
    </ConfigLayout>
  );
};
