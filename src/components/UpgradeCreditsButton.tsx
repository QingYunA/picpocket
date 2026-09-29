import React from 'react';
import { useI18n } from '@/i18n';
import { isInsufficientCreditsMessage } from '@/utils/errorMessage';
import { openOptionsPage } from '@/utils/navigation';

interface UpgradeCreditsButtonProps {
  /** 错误消息原文；仅当它是积分不足错误时才渲染按钮 */
  message: unknown;
  className?: string;
}

/** 积分不足时紧跟在错误文案后的「去升级」入口，跳转设置页的账号与套餐 */
export const UpgradeCreditsButton: React.FC<UpgradeCreditsButtonProps> = ({ message, className = '' }) => {
  const { t } = useI18n();
  if (!isInsufficientCreditsMessage(message)) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void openOptionsPage({ route: '/account' });
      }}
      className={`shrink-0 whitespace-nowrap rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 ${className}`}
    >
      {t('billing.upgradeCta')}
    </button>
  );
};

export default UpgradeCreditsButton;
