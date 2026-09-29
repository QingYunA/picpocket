import React from 'react';
import { Coins } from 'lucide-react';
import { useI18n } from '@/i18n';
import { openOptionsPage } from '@/utils/navigation';

interface CreditBalanceButtonProps {
  balance: number;
  /** 余额低于本次最低消耗时标红，提示先充值 */
  insufficient?: boolean;
  className?: string;
}

/** 生成/反推入口旁的积分余额，点击跳转设置页的账号与套餐 */
export const CreditBalanceButton: React.FC<CreditBalanceButtonProps> = ({ balance, insufficient = false, className = '' }) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => {
        void openOptionsPage({ route: '/account' });
      }}
      title={t('billing.creditsManageTooltip')}
      className={`flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-semibold tabular-nums transition-colors cursor-pointer ${
        insufficient
          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
          : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
      } ${className}`}
    >
      <Coins className={`h-3 w-3 ${insufficient ? 'text-red-500' : 'text-amber-600'}`} />
      {t('channels.balance', { balance })}
    </button>
  );
};

export default CreditBalanceButton;
