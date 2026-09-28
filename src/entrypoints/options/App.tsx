import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from './app-shell';
import { useHashRoute } from './navigation/useHashRoute';
import { GeneralPage } from './pages/general/GeneralPage';
import { VisionModelPage } from './pages/models-vision/VisionModelPage';
import { ImageModelPage } from './pages/models-image/ImageModelPage';
import { McpPage } from './pages/mcp/McpPage';
import { PromptsPage } from './pages/prompts/PromptsPage';
import { StoragePage } from './pages/storage/StoragePage';
import { ProPage } from './pages/pro/ProPage';
import { AccountPage } from './pages/account/AccountPage';
import { getUserSettings, saveUserSettings, DEFAULT_SETTINGS } from '@/utils/storage';
import type { UserSettings } from '@/types';

export const App: React.FC = () => {
  const { path, params, navigate } = useHashRoute();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Initial load
  useEffect(() => {
    getUserSettings().then(setSettings);
  }, []);

  // Multi-tab real-time sync via chrome.storage.onChanged
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes['promptsnap_settings']) {
        const newValue = changes['promptsnap_settings'].newValue as UserSettings | undefined;
        if (newValue) {
          setSettings(newValue);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleUpdateSettings = useCallback(
    async (updater: (prev: UserSettings) => UserSettings) => {
      const current = await getUserSettings();
      const updated = updater(current);
      setSettings(updated);
      await saveUserSettings(updated);
    },
    []
  );

  const renderCurrentPage = () => {
    switch (path) {
      case '/models/vision':
        return (
          <VisionModelPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            initialProvider={params.provider}
            highlightField={params.highlight}
          />
        );
      case '/models/image':
        return (
          <ImageModelPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            initialProvider={params.provider}
            highlightField={params.highlight}
          />
        );
      case '/mcp':
        return (
          <McpPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            highlightField={params.highlight}
          />
        );
      case '/prompts':
        return (
          <PromptsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            highlightField={params.highlight}
          />
        );
      case '/storage':
        return <StoragePage />;
      case '/account':
        return <AccountPage />;
      case '/pro':
        return (
          <ProPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            highlightField={params.highlight}
          />
        );
      case '/general':
      default:
        return (
          <GeneralPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            highlightField={params.highlight}
          />
        );
    }
  };

  return (
    <AppShell currentPath={path} onNavigate={navigate}>
      {renderCurrentPage()}
    </AppShell>
  );
};
export default App;
