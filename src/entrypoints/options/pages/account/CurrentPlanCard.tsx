import React from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Entitlement } from '@/services/accountBilling';
import { formatDate } from './format';

interface CurrentPlanCardProps {
  entitlement: Entitlement;
  busy: boolean;
  onCancel: () => void;
  onResume: () => void;
}

const PROVIDER_NAMES = { waffo: 'Waffo', paypal: 'PayPal' } as const;

export const CurrentPlanCard: React.FC<CurrentPlanCardProps> = ({ entitlement, busy, onCancel, onResume }) => {
  const { t, language } = useI18n();
  const sub = entitlement.subscription;
  const statusLine = !sub
    ? t('billing.monthlyAllowance', { credits: entitlement.monthlyCredits })
    : sub.status === 'past_due'
      ? t('billing.pastDue')
      : sub.cancelAtPeriodEnd
        ? t('billing.endsOn', { date: formatDate(sub.currentPeriodEnd, language) })
        : t('billing.renewsOn', { date: formatDate(sub.currentPeriodEnd, language) });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-xs font-semibold text-zinc-500">{t('billing.currentPlanTitle')}</div>
        <div className="mt-1 text-2xl font-bold text-zinc-900">{t(`billing.plans.${entitlement.plan}`)}</div>
        <p className={`mt-1 text-xs ${sub?.status === 'past_due' ? 'text-rose-600' : 'text-zinc-500'}`}>{statusLine}</p>
        {sub && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-400">{t('billing.managedBy', { provider: PROVIDER_NAMES[sub.provider] })}</span>
            <button
              type="button"
              onClick={sub.cancelAtPeriodEnd ? onResume : onCancel}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {sub.cancelAtPeriodEnd ? t('billing.resume') : t('billing.cancel')}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
          <Coins className="h-3.5 w-3.5" />
          {t('billing.balanceTitle')}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold text-zinc-900">{entitlement.balance}</span>
          <span className="text-xs text-zinc-500">{t('billing.creditsUnit')}</span>
        </div>
        {entitlement.buckets.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-amber-200/70 pt-3">
            {entitlement.buckets.map((bucket) => (
              <li key={`${bucket.source}-${bucket.expiresAt}`} className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-600">{t(`billing.sources.${bucket.source}`)}</span>
                <span className="text-zinc-500">
                  <span className="font-mono font-semibold text-zinc-800">{bucket.remaining}</span>
                  {' · '}
                  {t('billing.bucketExpires', { date: formatDate(bucket.expiresAt, language) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
