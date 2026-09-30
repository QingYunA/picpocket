import React from 'react';
import { Check, Circle, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface GettingStartedCardProps {
  hasItems: boolean;
  hasAnalyzed: boolean;
  signedIn: boolean;
  onGoGenerator: () => void;
  onSignIn: () => void;
  onDismiss: () => void;
}

/** 新手引导：三步走（保存 → 反推 → 生成）与免费积分入口；保存并反推过一张图后自动消失，也可手动关闭 */
export const GettingStartedCard: React.FC<GettingStartedCardProps> = ({
  hasItems,
  hasAnalyzed,
  signedIn,
  onGoGenerator,
  onSignIn,
  onDismiss,
}) => {
  const { t } = useI18n();
  const steps = [
    { key: 'save', done: hasItems, title: t('gettingStarted.saveTitle'), desc: t('gettingStarted.saveDesc') },
    { key: 'analyze', done: hasAnalyzed, title: t('gettingStarted.analyzeTitle'), desc: t('gettingStarted.analyzeDesc') },
    { key: 'generate', done: false, title: t('gettingStarted.generateTitle'), desc: t('gettingStarted.generateDesc') },
  ];

  return (
    <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3.5 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Sparkles className="h-3 w-3 text-sky-400" />
          </div>
          <h3 className="text-xs font-semibold text-zinc-900">{t('gettingStarted.title')}</h3>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          title={t('gettingStarted.dismiss')}
          aria-label={t('gettingStarted.dismiss')}
          className="shrink-0 cursor-pointer p-0.5 text-zinc-400 hover:text-zinc-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ol className="mt-3 space-y-2.5">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-start gap-2">
            {step.done ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${step.done ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                {index + 1}. {step.title}
              </p>
              {!step.done && <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{step.desc}</p>}
              {step.key === 'generate' && (
                <button
                  type="button"
                  onClick={onGoGenerator}
                  className="mt-1.5 cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 shadow-2xs transition-colors hover:bg-zinc-50"
                >
                  {t('gettingStarted.generateAction')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!signedIn && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-2">
          <span className="text-[11px] leading-snug text-amber-900">{t('gettingStarted.freeCredits')}</span>
          <button
            type="button"
            onClick={onSignIn}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
          >
            {t('gettingStarted.signIn')}
          </button>
        </div>
      )}
    </div>
  );
};
