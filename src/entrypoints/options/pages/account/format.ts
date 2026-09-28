import type { Language } from '@/types';

export function formatDate(iso: string, language: Language): string {
  return new Date(iso).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}
