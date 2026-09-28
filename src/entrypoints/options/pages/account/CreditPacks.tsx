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

const PriceRows: React.FC<{ title: string; rows: Array<{ id: string; price: string }> }> = ({ title, rows }) => (
  <div>
    <div className="mb-1.5 font-semibold text-zinc-700">{title}</div>
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.id} className="flex justify-between gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5">
          <span className="truncate font-mono text-zinc-700">{row.id}</span>
          <span className="shrink-0 text-zinc-500">{row.price}</span>
        </li>
      ))}
    </ul>
  </div>
);

export const PricingList: React.FC<{ pricing: Entitlement['pricing'] }> = ({ pricing }) => {
  const { t } = useI18n();
  const visionRows = pricing.vision.map(({ id, min, max }) => ({
    id,
    price: min === max ? `${min} ${t('billing.creditsUnit')}` : t('billing.pricingRange', { min, max }),
  }));
  const imageRows = pricing.image.map(({ id, credits, credits4k }) => ({
    id,
    price: `${credits} ${t('billing.creditsUnit')}${credits4k ? ` · ${t('billing.pricing4k', { credits: credits4k })}` : ''}`,
  }));
  return (
    <div className="space-y-4 py-5 text-xs text-zinc-600">
      <PriceRows title={t('billing.pricingVision')} rows={visionRows} />
      <PriceRows title={t('billing.pricingImage')} rows={imageRows} />
    </div>
  );
};
