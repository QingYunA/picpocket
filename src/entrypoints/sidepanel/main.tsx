import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/styles/theme.css';
import { I18nProvider, useI18n } from '@/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** 崩溃兜底页：函数组件才能读取当前界面语言 */
function ErrorFallback({ error }: { error: Error | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  const handleCopy = () => {
    if (!error) return;
    navigator.clipboard
      .writeText(`${error.name}: ${error.message}\n${error.stack || ''}`)
      .then(() => {
        setCopied(true);
        if (copyTimeout.current) clearTimeout(copyTimeout.current);
        copyTimeout.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center bg-white font-sans text-zinc-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-200 shadow-2xs mb-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 className="text-sm font-bold text-zinc-900">{t('errorBoundary.title')}</h2>
      <p className="mt-1 text-xs text-zinc-500 max-w-xs leading-relaxed">{t('errorBoundary.desc')}</p>

      <div className="mt-3 w-full max-w-xs rounded-lg border border-red-100 bg-red-50/60 p-2.5 text-left">
        <p className="text-[11px] font-mono text-red-800 break-words line-clamp-3">
          {error?.message || t('errorBoundary.unknown')}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
        >
          {t('errorBoundary.reload')}
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          {copied ? t('common.copied') : t('errorBoundary.copyError')}
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PicPocket Global Caught Error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);
