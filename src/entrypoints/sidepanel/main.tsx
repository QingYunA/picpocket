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
  copied?: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PicPocket Global Caught Error:', error, info);
  }

  override componentWillUnmount() {
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center bg-white font-sans text-zinc-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-200 shadow-2xs mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h2 className="text-sm font-bold text-zinc-900">PicPocket 运行时出现异常</h2>
          <p className="mt-1 text-xs text-zinc-500 max-w-xs leading-relaxed">
            侧边栏加载遇到错误，你可以尝试重新载入，或复制错误信息进行排查。
          </p>

          <div className="mt-3 w-full max-w-xs rounded-lg border border-red-100 bg-red-50/60 p-2.5 text-left">
            <p className="text-[11px] font-mono text-red-800 break-words line-clamp-3">
              {this.state.error?.message || '未知异常'}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
            >
              重新载入
            </button>
            <button
              onClick={() => {
                if (this.state.error) {
                  navigator.clipboard.writeText(`${this.state.error.name}: ${this.state.error.message}\n${this.state.error.stack || ''}`);
                  this.setState({ copied: true });
                  if (this.copyTimeout) clearTimeout(this.copyTimeout);
                  this.copyTimeout = setTimeout(() => this.setState({ copied: false }), 2000);
                }
              }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              {this.state.copied ? '已复制！' : '复制错误'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
