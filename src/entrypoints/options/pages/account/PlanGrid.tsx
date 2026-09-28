import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import {
  PLANS,
  subscriptionSku,
  yearlySavingsPercent,
  type BillingInterval,
  type Entitlement,
  type PaidPlanId,
  type Sku,
} from '@/services/accountBilling';
import { formatUsd } from './format';

interface PlanGridProps {
  entitlement: Entitlement;
  disabled: boolean;
  onChoose: (sku: Sku) => void;
}

export const PlanGrid: React.FC<PlanGridProps> = ({ entitlement, disabled, onChoose }) => {
  const { t } = useI18n();
  const [interval, setBillingInterval] = useState<BillingInterval>(entitlement.subscription?.interval ?? 'month');
  const current = entitlement.subscription;

  return (
    <div className="py-5">
      <div className="mb-4 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {(['month', 'year'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setBillingInterval(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${
              interval === value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {value === 'month' ? t('billing.monthly') : t('billing.yearly')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === entitlement.plan && (plan.id === 'free' || current?.interval === interval);
          const price = plan.usd[interval];
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-4 ${isCurrent ? 'border-amber-300 bg-amber-50/40' : 'border-zinc-200 bg-white'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900">{t(`billing.plans.${plan.id}`)}</span>
                {plan.id !== 'free' && interval === 'year' && (
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {t('billing.savePercent', { percent: yearlySavingsPercent(plan.id as PaidPlanId) })}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-xl font-bold text-zinc-900">{formatUsd(price)}</span>
                {plan.id !== 'free' && (
                  <span className="text-xs text-zinc-500">{interval === 'month' ? t('billing.perMonth') : t('billing.perYear')}</span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {t('billing.monthlyAllowance', { credits: plan.monthlyCredits })}
              </p>
              <div className="mt-4 flex-1" />
              {isCurrent ? (
                <span className="rounded-xl bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-800">
                  {t('billing.currentBadge')}
                </span>
              ) : plan.id === 'free' ? null : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoose(subscriptionSku(plan.id as PaidPlanId, interval))}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {current ? t('billing.switchPlan') : t('billing.subscribe')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
