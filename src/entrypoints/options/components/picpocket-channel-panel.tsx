import React from 'react';
import { Check, Coins, Cpu, UserRound, Zap } from 'lucide-react';
import { ConfigSection } from './config-section';
import { ConfigItem } from './config-item';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlement } from '@/hooks/useEntitlement';
import { PLANS } from '@/services/accountBilling';
import type { ModelCapability } from '@/config/channelSelection';
import { HOSTED_IMAGE_MODELS, HOSTED_VISION_MODELS } from '@/config/hostedModels';
import { useI18n } from '@/i18n';

interface PicPocketChannelPanelProps {
  capability: ModelCapability;
  isActive: boolean;
  /** 当前的默认托管模型 */
  model: string;
  onSetActive: () => void;
  onSelectModel: (model: string) => void;
}

const FREE_MONTHLY_CREDITS = PLANS.find((plan) => plan.id === 'free')!.monthlyCredits;

/** 设置页里的 PicPocket 官方渠道：不需要配置 Key，展示账号状态与可选的托管模型 */
export const PicPocketChannelPanel: React.FC<PicPocketChannelPanelProps> = ({
  capability,
  isActive,
  model,
  onSetActive,
  onSelectModel,
}) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { entitlement } = useEntitlement(user?.id ?? null);
  const models = capability === 'vision' ? HOSTED_VISION_MODELS : HOSTED_IMAGE_MODELS;

  return (
    <ConfigSection
      title={t('channels.picpocketName')}
      description={t('channels.picpocketDescription')}
      icon={<Logo size={20} />}
      badge={isActive ? (
        <span className="flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          <Check className="h-3 w-3" />{t('options.vision.activeBadge')}
        </span>
      ) : (
        <button type="button" onClick={onSetActive} className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
          <Zap className="h-3 w-3 text-amber-400" />{t('options.vision.setAsDefaultBtn')}
        </button>
      )}
    >
      <ConfigItem
        title={t('channels.accountTitle')}
        description={user
          ? t('channels.signedInAs', { email: user.email || user.name })
          : t('channels.signInPrompt', { credits: FREE_MONTHLY_CREDITS })}
        icon={<UserRound className="h-4 w-4" />}
      >
        <div className="flex items-center gap-3">
          {user && entitlement && (
            <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-zinc-700">
              <Coins className="h-3.5 w-3.5 text-amber-500" />
              {t('channels.balance', { balance: entitlement.balance })}
            </span>
          )}
          <a href="#/account" className="whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
            {user ? t('options.nav.account') : t('channels.signIn')}
          </a>
        </div>
      </ConfigItem>
      <ConfigItem
        title={t('channels.defaultModel')}
        description={t('channels.defaultModelHint')}
        icon={<Cpu className="h-4 w-4" />}
        orientation="vertical"
      >
        <div className="flex max-w-2xl flex-wrap gap-1.5" role="radiogroup">
          {models.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === model}
              onClick={() => onSelectModel(id)}
              className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors cursor-pointer ${
                id === model
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </ConfigItem>
    </ConfigSection>
  );
};
