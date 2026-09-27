import { zh, type Translations } from './locales/zh';
import { en } from './locales/en';
import type { Language } from '../types';

export const locales: Record<Language, Translations> = {
  zh,
  en,
};

type Prev = [never, 0, 1, 2, 3, 4, 5];

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${'' extends P ? '' : '.'}${P}`
    : never
  : never;

export type Leaves<T, D extends number = 3> = [D] extends [never]
  ? never
  : T extends readonly any[]
  ? ''
  : T extends Record<string, any>
  ? { [K in keyof T]-?: Join<K, Leaves<T[K], Prev[D]>> }[keyof T]
  : '';

export type TranslationKey = Leaves<Translations>;

/**
 * Resolve a dot-separated path in an object, e.g. "header.capture"
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}

/**
 * Get translated text by key path and optional parameters for interpolation
 */
export function getTranslation(
  lang: Language = 'zh',
  path: TranslationKey | (string & {}),
  params?: Record<string, string | number>
): any {
  const currentDict = locales[lang] || locales.zh;
  let text = getNestedValue(currentDict, path);

  // Fallback to Chinese if key is missing in target language
  if (text === undefined && lang !== 'zh') {
    text = getNestedValue(locales.zh, path);
  }

  // If still missing, return the path itself as fallback and issue dev warning
  if (text === undefined) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(`[PicPocket i18n] Missing translation key: "${path}" in ${lang} dictionary`);
    }
    return path;
  }

  if (Array.isArray(text)) {
    return text;
  }

  // Prevent returning "[object Object]" if caller passes a non-leaf parent path
  if (text !== null && typeof text === 'object') {
    return path;
  }

  if (typeof text !== 'string') {
    return String(text);
  }

  // Safe interpolation without RegExp escaping pitfalls
  if (params) {
    return Object.entries(params).reduce((acc, [k, v]) => {
      return acc.split(`{${k}}`).join(String(v));
    }, text);
  }

  return text;
}

export * from './locales/zh';
export * from './context';
