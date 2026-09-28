import React from 'react';
import { useI18n } from '@/i18n';
import { CREDIT_PACKS, type Entitlement, type Sku } from '@/services/accountBilling';
import { formatUsd } from './format';

interface CreditPacksProps {
  disabled: boolean;
  onBuy: (sku: Sku) => void;
}

export const CreditPacks: React.FC<CreditPacksProps> = ({ disabled, onBuy }) => {
  const { t } = useI18n();
  return (
    <div className="py-5">
      <p className="mb-3 text-xs text-zinc-500">{t('billing.packsDesc', { months: CREDIT_PACKS[0]!.validMonths })}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.sku} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <div className="text-sm font-bold text-zinc-900">
                {pack.credits} {t('billing.creditsUnit')}
              </div>
              <div className="text-xs text-zinc-500">{formatUsd(pack.usd)}</div>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onBuy(pack.sku)}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              {t('billing.buy')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PricingList: React.FC<{ pricing: Entitlement['pricing'] }> = ({ pricing }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-3 py-5 text-xs text-zinc-600">
      <p>{t('billing.pricingVision', { min: pricing.vision.min, max: pricing.vision.max })}</p>
      <div>
        <div className="mb-1.5 font-semibold text-zinc-700">{t('billing.pricingImage')}</div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {Object.entries(pricing.image).map(([model, credits]) => (
            <li key={model} className="flex justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5">
              <span className="font-mono text-zinc-700">{model}</span>
              <span className="text-zinc-500">
                {credits} {t('billing.creditsUnit')}
                {pricing.image4k?.[model] ? ` · ${t('billing.pricing4k', { credits: pricing.image4k[model] })}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
