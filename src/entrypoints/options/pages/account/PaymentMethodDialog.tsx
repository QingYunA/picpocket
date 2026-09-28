import React from 'react';
import { CreditCard, Wallet, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { PaymentProvider } from '@/services/accountBilling';

interface PaymentMethodDialogProps {
  isOpen: boolean;
  onChoose: (provider: PaymentProvider) => void;
  onClose: () => void;
}

export const PaymentMethodDialog: React.FC<PaymentMethodDialogProps> = ({ isOpen, onChoose, onClose }) => {
  const { t } = useI18n();
  if (!isOpen) return null;
  const options = [
    { provider: 'waffo' as const, icon: CreditCard, title: t('billing.payWithCard'), desc: t('billing.payWithCardDesc') },
    { provider: 'paypal' as const, icon: Wallet, title: t('billing.payWithPaypal'), desc: t('billing.payWithPaypalDesc') },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">{t('billing.choosePaymentTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {options.map(({ provider, icon: Icon, title, desc }) => (
            <button
              key={provider}
              type="button"
              onClick={() => onChoose(provider)}
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left hover:border-amber-300 hover:bg-amber-50/40 cursor-pointer"
            >
              <Icon className="h-5 w-5 shrink-0 text-zinc-600" />
              <span>
                <span className="block text-xs font-semibold text-zinc-900">{title}</span>
                <span className="block text-[11px] text-zinc-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
