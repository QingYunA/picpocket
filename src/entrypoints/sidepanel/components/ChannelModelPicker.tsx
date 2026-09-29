import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { BrandIcon } from './BrandIcon';
import { VISION_PROVIDERS } from '@/config/visionChannels';
import { IMAGE_PROVIDERS } from '@/config/imageChannels';
import {
  channelModelGroups,
  currentChannelModel,
  selectChannelModel,
  type ChannelModelGroup,
  type ChannelModelSelection,
  type ModelCapability,
} from '@/config/channelSelection';
import { PICPOCKET_CHANNEL_ID } from '@/config/hostedModels';
import { getUserSettings, saveUserSettings } from '@/utils/storage';
import { useI18n } from '@/i18n';
import type { UserSettings } from '@/types';

interface ChannelModelPickerProps {
  capability: ModelCapability;
  settings: UserSettings;
  onOpenSettings?: () => void;
  /** 切换成功后通知调用方（例如同步本地的模型状态） */
  onSelected?: (selection: ChannelModelSelection) => void;
  align?: 'left' | 'right';
  className?: string;
}

const providerIcon = (capability: ModelCapability, providerId: string): string | undefined => {
  const providers: ReadonlyArray<{ id: string; icon: string }> = capability === 'vision' ? VISION_PROVIDERS : IMAGE_PROVIDERS;
  return providers.find((provider) => provider.id === providerId)?.icon;
};

const ChannelIcon: React.FC<{ capability: ModelCapability; group: ChannelModelGroup | undefined }> = ({ capability, group }) => {
  if (!group || group.channelId === PICPOCKET_CHANNEL_ID) return <Logo size={14} />;
  const icon = providerIcon(capability, group.providerId);
  return icon ? <BrandIcon icon={icon} className="h-3.5 w-3.5 shrink-0" /> : <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400" />;
};

/**
 * 按渠道分组的模型选择器：PicPocket 官方渠道在最前，其后是用户自己的渠道。
 * 选择某个模型即同时切换当前渠道，设置页里的「当前使用」随之变化。
 */
export const ChannelModelPicker: React.FC<ChannelModelPickerProps> = ({
  capability,
  settings,
  onOpenSettings,
  onSelected,
  align = 'left',
  className = '',
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<ChannelModelSelection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => channelModelGroups(settings, capability), [settings, capability]);
  const saved = useMemo(() => currentChannelModel(settings, capability), [settings, capability]);
  // 保存完成、设置回流之前先显示刚选的值
  const current = pending ?? saved;
  const currentGroup = groups.find((group) => group.channelId === current.channelId);

  useEffect(() => {
    setPending(null);
  }, [saved.channelId, saved.model]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const channelName = (group: ChannelModelGroup | undefined) =>
    !group || group.channelId === PICPOCKET_CHANNEL_ID ? t('channels.picpocketName') : group.name;

  const handleSelect = async (selection: ChannelModelSelection) => {
    setIsOpen(false);
    if (selection.channelId === current.channelId && selection.model === current.model) return;
    setPending(selection);
    try {
      const fresh = await getUserSettings();
      await saveUserSettings(selectChannelModel(fresh, capability, selection));
      onSelected?.(selection);
    } catch (err) {
      console.warn('Failed to switch channel/model:', err);
      setPending(null);
    }
  };

  const triggerDetail = currentGroup?.missingKey
    ? t('channels.missingKey')
    : current.model || t('channels.noModel');

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 shadow-2xs transition-colors hover:border-zinc-300 hover:bg-zinc-50 cursor-pointer"
        title={`${channelName(currentGroup)} · ${triggerDetail}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <ChannelIcon capability={capability} group={currentGroup} />
        <span className={`min-w-0 flex-1 truncate text-left font-mono text-[11px] font-medium ${currentGroup?.missingKey ? 'text-amber-600' : 'text-zinc-800'}`}>
          {triggerDetail}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-1.5 w-[280px] max-w-[calc(100vw-24px)] rounded-2xl border border-zinc-200/90 bg-white p-2 text-zinc-900 shadow-xl`}
          >
            <div className="max-h-80 overflow-y-auto">
              {groups.map((group, index) => (
                <div key={group.channelId} className={index > 0 ? 'mt-1.5 border-t border-zinc-100 pt-1.5' : ''}>
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 text-[10px] font-semibold tracking-wide text-zinc-500">
                    <ChannelIcon capability={capability} group={group} />
                    <span className="truncate">{channelName(group)}</span>
                    {group.channelId === PICPOCKET_CHANNEL_ID && (
                      <span className="shrink-0 rounded bg-amber-100/70 px-1 py-px text-[9px] text-amber-700">{t('channels.picpocketTag')}</span>
                    )}
                    {group.missingKey && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-100/70 px-1 py-px text-[9px] text-amber-700">
                        <AlertCircle className="h-2.5 w-2.5" />
                        {t('channels.missingKey')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-px">
                    {group.models.length === 0 && (
                      <div className="py-1 pl-7 pr-2 text-[11px] text-zinc-400">{t('channels.noModel')}</div>
                    )}
                    {group.models.map((model) => {
                      const isSelected = group.channelId === current.channelId && model === current.model;
                      return (
                        <button
                          key={model}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect({ channelId: group.channelId, model })}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg py-1.5 pl-7 pr-2 text-left transition-colors cursor-pointer ${
                            isSelected ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                          } ${group.missingKey ? 'opacity-60' : ''}`}
                        >
                          <span className="truncate font-mono text-[11px]">{model}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                        </button>
                      );
                    })}
                    {group.missingKey && onOpenSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onOpenSettings();
                        }}
                        className="flex w-full items-center gap-1 py-1 pl-7 pr-2 text-left text-[10px] font-medium text-amber-700 hover:underline cursor-pointer"
                      >
                        {t('channels.fillKey')}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {onOpenSettings && (
              <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-zinc-700 cursor-pointer"
                >
                  <span>{t('channels.manage')}</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
