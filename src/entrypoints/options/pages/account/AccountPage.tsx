import React, { useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { useI18n } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlement } from '@/hooks/useEntitlement';
import {
  BillingError,
  manageSubscription,
  requestCheckoutUrl,
  type BillingErrorCode,
  type PaymentProvider,
  type Sku,
} from '@/services/accountBilling';
import { AccountDialog } from '@/entrypoints/sidepanel/components/AccountDialog';
import { ConfirmModal } from '@/entrypoints/sidepanel/components/ConfirmModal';
import { CurrentPlanCard } from './CurrentPlanCard';
import { PlanGrid } from './PlanGrid';
import { CreditPacks, PricingList } from './CreditPacks';
import { PaymentMethodDialog } from './PaymentMethodDialog';
import { formatDate } from './format';

export const AccountPage: React.FC = () => {
  const { t, language } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { entitlement, loading, error: loadError, refresh, watchCheckout } = useEntitlement(user?.id ?? null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [pendingSku, setPendingSku] = useState<Sku | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<BillingErrorCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof BillingError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const openCheckout = (provider: PaymentProvider, sku: Sku) =>
    runAction(async () => {
      setPendingSku(null);
      const url = await requestCheckoutUrl(provider, sku);
      await chrome.tabs.create({ url });
      setNotice(t('billing.checkoutOpened'));
      watchCheckout();
    });

  /** 已有订阅时沿用原付款渠道（Waffo 走计划变更），否则让用户选择付款方式 */
  const choose = (sku: Sku) => {
    const isSubscription = !sku.startsWith('credits_');
    const provider = isSubscription ? entitlement?.subscription?.provider : undefined;
    if (provider) openCheckout(provider, sku);
    else setPendingSku(sku);
  };

  const setRenewal = (action: 'cancel' | 'resume') =>
    runAction(async () => {
      setConfirmCancel(false);
      await manageSubscription(action);
      await refresh();
      watchCheckout();
    });

  if (authLoading) {
    return (
      <ConfigLayout title={t('billing.title')} description={t('billing.subtitle')}>
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </ConfigLayout>
    );
  }

  if (!user) {
    return (
      <ConfigLayout title={t('billing.title')} description={t('billing.subtitle')}>
        <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <UserRound className="h-8 w-8 text-zinc-400" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">{t('billing.signInTitle')}</h2>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">{t('billing.signInDesc')}</p>
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer"
          >
            {t('billing.signIn')}
          </button>
        </div>
        <AccountDialog isOpen={signInOpen} user={null} onClose={() => setSignInOpen(false)} />
      </ConfigLayout>
    );
  }

  const error = actionError ?? loadError;
  return (
    <ConfigLayout title={t('billing.title')} description={t('billing.subtitle')}>
      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <span>{t(`billing.errors.${error}`)}</span>
          {!entitlement && (
            <button type="button" onClick={refresh} className="font-semibold underline cursor-pointer">
              {t('billing.retry')}
            </button>
          )}
        </div>
      )}
      {notice && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{notice}</div>}

      {!entitlement ? (
        loading && <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      ) : (
        <>
          <CurrentPlanCard
            entitlement={entitlement}
            busy={busy}
            onCancel={() => setConfirmCancel(true)}
            onResume={() => setRenewal('resume')}
          />
          <ConfigSection title={t('billing.plansTitle')}>
            <PlanGrid entitlement={entitlement} disabled={busy} onChoose={choose} />
          </ConfigSection>
          <ConfigSection title={t('billing.packsTitle')}>
            <CreditPacks disabled={busy} onBuy={choose} />
          </ConfigSection>
          <ConfigSection title={t('billing.pricingTitle')}>
            <PricingList pricing={entitlement.pricing} />
          </ConfigSection>
        </>
      )}

      <PaymentMethodDialog
        isOpen={pendingSku !== null}
        onChoose={(provider) => pendingSku && openCheckout(provider, pendingSku)}
        onClose={() => setPendingSku(null)}
      />
      <ConfirmModal
        isOpen={confirmCancel}
        title={t('billing.cancelConfirmTitle')}
        description={t('billing.cancelConfirmDesc', {
          date: entitlement?.subscription ? formatDate(entitlement.subscription.currentPeriodEnd, language) : '',
        })}
        confirmText={t('billing.cancelConfirmOk')}
        cancelText={t('billing.keepPlan')}
        isDestructive
        onConfirm={() => setRenewal('cancel')}
        onClose={() => setConfirmCancel(false)}
      />
    </ConfigLayout>
  );
};
