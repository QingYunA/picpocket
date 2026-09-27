import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import {
  activateLicenseKey, getLicenseErrorKey,
  getProMembership,
} from '@/services/billing';
import type { ProMembership } from '@/types';

interface ProSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated?: () => void;
}

export const ProSubscriptionModal: React.FC<ProSubscriptionModalProps> = ({
  isOpen,
  onClose,
  onActivated,
}) => {
  const { t } = useI18n();

  const [membership, setMembership] = useState<ProMembership>({ isPro: false });
  const [licenseInput, setLicenseInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [showInputOverride, setShowInputOverride] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getProMembership().then(setMembership);
      setFeedback(null);
      setShowInputOverride(false);
      setLicenseInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleActivate = async () => {
    if (!licenseInput.trim()) {
      setFeedback({ msg: t('subscription.licensePlaceholder'), isError: true });
      return;
    }
    setIsActivating(true);
    setFeedback(null);
    try {
      const res = await activateLicenseKey(licenseInput.trim());
      if (res.success && res.membership) {
        setMembership(res.membership);
        setFeedback({ msg: t('subscription.activatedSuccess') });
        setLicenseInput('');
        setShowInputOverride(false);
        onActivated?.();
      } else {
        setFeedback({
          msg: res.errorCode ? t(getLicenseErrorKey(res.errorCode)) : res.message || t('subscription.invalidKey'),
          isError: true,
        });
      }
    } catch (err: any) {
      setFeedback({ msg: err.message || t('subscription.invalidKey'), isError: true });
    } finally {
      setIsActivating(false);
    }
  };

  const isActivated = Boolean(membership.isPro);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-xl text-zinc-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                {t('subscription.modalTitle')}
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                {t('subscription.modalDesc')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-5 py-4 space-y-4 text-xs">
          {/* Activated View */}
          {isActivated && !showInputOverride ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-xs">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{t('subscription.activeStatus')}</span>
                </div>
                {membership.licenseKey && (
                  <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-900">
                    {membership.licenseKey}
                  </span>
                )}
              </div>

              {/* Dual Quota Stats */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/60">
                <div className="rounded-lg bg-white p-2.5 border border-emerald-200/80">
                  <span className="text-[11px] text-zinc-500 font-medium block">
                    {t('subscription.visionQuotaLabel')}
                  </span>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-sm font-bold font-mono text-zinc-900">
                      {membership.visionQuotaRemaining ?? membership.quotaRemaining ?? '—'}
                    </span>
                    {membership.visionTotalQuota && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        / {membership.visionTotalQuota}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400 ml-1">次</span>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-emerald-200/80">
                  <span className="text-[11px] text-zinc-500 font-medium block">
                    {t('subscription.imageQuotaLabel')}
                  </span>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-sm font-bold font-mono text-zinc-900">
                      {membership.imageQuotaRemaining ?? '—'}
                    </span>
                    {membership.imageTotalQuota && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        / {membership.imageTotalQuota}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400 ml-1">次</span>
                  </div>
                </div>
              </div>

              {/* Expiration or note */}
              <div className="flex items-center justify-between pt-0.5 text-[11px] text-zinc-500">
                {membership.expiresAt ? (
                  <span>
                    {t('subscription.activeExpire', {
                      date: new Date(membership.expiresAt).toLocaleDateString(),
                    })}
                  </span>
                ) : (
                  <span>永久有效</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowInputOverride(true)}
                  className="text-zinc-600 hover:text-zinc-900 font-medium cursor-pointer underline text-[11px]"
                >
                  {t('subscription.changeCodeBtn')}
                </button>
              </div>
            </div>
          ) : (
            /* Input Redeem Form */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-zinc-700">
                  {t('subscription.hasLicenseKey')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={licenseInput}
                    onChange={(e) => setLicenseInput(e.target.value)}
                    placeholder={t('subscription.licensePlaceholder')}
                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    disabled={isActivating || !licenseInput.trim()}
                    onClick={handleActivate}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                  >
                    {isActivating ? t('subscription.validating') : t('subscription.activateBtn')}
                  </button>
                </div>
              </div>

              {feedback && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-1.5 ${
                    feedback.isError
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {feedback.isError ? (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  )}
                  <span>{feedback.msg}</span>
                </div>
              )}

              {isActivated && showInputOverride && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowInputOverride(false)}
                    className="text-zinc-500 hover:text-zinc-800 text-[11px] cursor-pointer"
                  >
                    ← 返回当前额度
                  </button>
                </div>
              )}

              <p className="text-[11px] text-zinc-400 pt-1 leading-relaxed">
                {t('subscription.byokHint')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 bg-zinc-50/40 px-5 py-2.5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-xs text-zinc-600 hover:text-zinc-900 font-medium cursor-pointer transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
