import React, { useState } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { useI18n } from '@/i18n';
import type { UserSettings } from '@/types';
import { activateLicenseKey, getLicenseErrorKey } from '@/services/billing';
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ProPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  highlightField?: string;
}

export const ProPage: React.FC<ProPageProps> = ({
  settings,
  onUpdateSettings,
  highlightField,
}) => {
  const { t } = useI18n();

  const proMembership = settings.proMembership;
  const isPro = proMembership?.isPro ?? false;

  const [licenseInput, setLicenseInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleActivate = async () => {
    if (!licenseInput.trim()) return;
    setIsActivating(true);
    setActivateResult(null);
    try {
      const res = await activateLicenseKey(licenseInput.trim());
      if (res.success && res.membership) {
        await onUpdateSettings((prev) => ({
          ...prev,
          proMembership: res.membership,
        }));
        setActivateResult({ success: true, message: t('options.pro.activateSuccess') });
        setLicenseInput('');
      } else {
        setActivateResult({
          success: false,
          message: res.errorCode ? t(getLicenseErrorKey(res.errorCode)) : res.message || t('options.pro.activateFailed'),
        });
      }
    } catch (err) {
      setActivateResult({ success: false, message: `${t('options.pro.activateFailed')}: ${String(err)}` });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <ConfigLayout
      title={t('options.pro.title')}
      description={t('options.pro.description')}
    >
      {/* 1. Status Card */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isPro
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-zinc-200 bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                isPro
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900">
                  {isPro ? t('options.pro.proActiveTitle') : t('options.pro.freeTitle')}
                </h2>
                {isPro && proMembership?.licenseKey && (
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {proMembership.licenseKey}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {isPro && proMembership?.expiresAt
                  ? `${t('options.pro.validUntil')} ${new Date(proMembership.expiresAt).toLocaleDateString()}`
                  : t('options.pro.freeDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Dual Quota Status */}
        {isPro && (typeof proMembership?.visionQuotaRemaining === 'number' || typeof proMembership?.imageQuotaRemaining === 'number') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-emerald-200/60">
            <div className="p-3.5 rounded-xl bg-white border border-emerald-200/80">
              <span className="text-xs font-semibold text-zinc-700 block">
                {t('options.pro.remainingVisionQuota')}
              </span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {proMembership?.visionQuotaRemaining ?? '—'}
                </span>
                {proMembership?.visionTotalQuota && (
                  <span className="text-xs text-zinc-400 font-mono">
                    / {proMembership.visionTotalQuota}
                  </span>
                )}
                <span className="text-xs text-zinc-500 ml-1">次</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-emerald-200/80">
              <span className="text-xs font-semibold text-zinc-700 block">
                {t('options.pro.remainingImageQuota')}
              </span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {proMembership?.imageQuotaRemaining ?? '—'}
                </span>
                {proMembership?.imageTotalQuota && (
                  <span className="text-xs text-zinc-400 font-mono">
                    / {proMembership.imageTotalQuota}
                  </span>
                )}
                <span className="text-xs text-zinc-500 ml-1">次</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. License Key Activation */}
      <ConfigSection
        title={t('options.pro.redeemTitle')}
        description={t('options.pro.redeemDesc')}
        icon={<KeyRound className="h-4 w-4 text-zinc-700" />}
      >
        <ConfigItem
          title={t('options.pro.inputCodeTitle')}
          description={t('options.pro.inputCodeDesc')}
          orientation="vertical"
          highlight={highlightField === 'licenseKey'}
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full max-w-lg pt-1">
            <input
              type="text"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              placeholder="如 XIALINGUO666"
              className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none shadow-2xs transition-all"
            />
            <button
              type="button"
              onClick={handleActivate}
              disabled={isActivating || !licenseInput.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 shadow-2xs transition-all cursor-pointer shrink-0"
            >
              {isActivating ? t('options.pro.validating') : t('options.pro.redeemBtn')}
            </button>
          </div>
        </ConfigItem>

        {activateResult && (
          <div className="py-2">
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                activateResult.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {activateResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              )}
              <span>{activateResult.message}</span>
            </div>
          </div>
        )}
      </ConfigSection>
    </ConfigLayout>
  );
};
