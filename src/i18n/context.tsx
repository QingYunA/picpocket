import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Language } from '../types';
import { getTranslation, type TranslationKey } from './index';
import { getUserSettings, saveUserSettings, getDefaultLanguage, onLanguageChange } from '../utils/storage';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (path: TranslationKey, params?: Record<string, string | number>) => any;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getDefaultLanguage());

  // Load language preference from storage
  useEffect(() => {
    getUserSettings().then((settings) => {
      if (settings.language) {
        setLanguageState(settings.language);
      }
    });

    // Listen for storage changes from other contexts
    return onLanguageChange((newLang) => {
      setLanguageState(newLang);
    });
  }, []);

  const setLanguage = useCallback(async (newLang: Language) => {
    setLanguageState(newLang);
    await saveUserSettings({ language: newLang });
  }, []);

  const t = useCallback(
    (path: TranslationKey, params?: Record<string, string | number>) => {
      return getTranslation(language, path, params);
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    // Graceful fallback if called outside provider
    const fallbackLang = getDefaultLanguage();
    return {
      language: fallbackLang,
      setLanguage: async () => {},
      t: (path: TranslationKey, params?: Record<string, string | number>) =>
        getTranslation(fallbackLang, path, params),
    };
  }
  return context;
}
