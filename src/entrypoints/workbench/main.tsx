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

class WorkbenchErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PicPocket Workbench Caught Error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      const isZh = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh');
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center bg-zinc-950 font-sans text-zinc-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/60 text-red-400 border border-red-800/60 shadow-2xs mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-zinc-100">
            {isZh ? '工作台加载遇到问题' : 'Workbench Failed to Load'}
          </h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-sm leading-relaxed">
            {this.state.error?.message || (isZh ? '发生未知异常，请尝试重新载入' : 'An unknown error occurred')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white transition-colors cursor-pointer"
          >
            {isZh ? '重新载入工作台' : 'Reload Workbench'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkbenchErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </WorkbenchErrorBoundary>
  </React.StrictMode>
);
