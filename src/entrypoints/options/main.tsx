import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/styles/theme.css';
import { I18nProvider } from '@/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class OptionsErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PicPocket Options Caught Error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center bg-white font-sans text-zinc-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-200 shadow-2xs mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-zinc-900">Options Failed to Load / 设置页面加载异常</h2>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm leading-relaxed">
            {this.state.error?.message || 'Unknown Error / 未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Reload Settings / 重新载入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </OptionsErrorBoundary>
  </React.StrictMode>
);
