import React, { useState, useEffect, useRef } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { useI18n } from '@/i18n';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  getStorageEstimate,
  exportAllDataAsBackup,
  exportMetadataAsJsonBackup,
  restoreFromBackupJson,
  type StorageEstimateResult,
} from '@/services/storageBackup';
import {
  HardDrive,
  Download,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Database,
  Archive,
  FileJson,
} from 'lucide-react';

export const StoragePage: React.FC = () => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [estimate, setEstimate] = useState<StorageEstimateResult>({
    usedBytes: 0,
    quotaBytes: 0,
    usedFormatted: '0 B',
    quotaFormatted: null,
    percent: 0,
  });

  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  const itemsCount = useLiveQuery(() => db.items.count()) || 0;
  const tasksCount = useLiveQuery(() => db.generationTasks.count()) || 0;
  const promptsCount = useLiveQuery(() => db.promptItems.count()) || 0;

  useEffect(() => {
    getStorageEstimate().then(setEstimate);
  }, []);

  const handleExportZip = async () => {
    setIsExportingZip(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      await exportAllDataAsBackup();
      setActionSuccessMsg(t('options.storage.exportSuccess'));
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Failed to export ZIP backup:', err);
      setActionErrorMsg(String(err));
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportJson = async () => {
    setIsExportingJson(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      await exportMetadataAsJsonBackup();
      setActionSuccessMsg(t('options.storage.exportSuccess'));
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Failed to export JSON backup:', err);
      setActionErrorMsg(String(err));
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    try {
      const text = await file.text();
      const res = await restoreFromBackupJson(text);
      setActionSuccessMsg(
        `${t('options.storage.restoreSuccess')} (${res.promptsRestored} prompts, ${res.foldersRestored} folders)`
      );
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed to restore backup:', err);
      setActionErrorMsg(err?.message || t('options.storage.restoreFailed'));
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <ConfigLayout
      title={t('settings.storageAndBackupTitle')}
      description={t('settings.storageAndBackupDesc')}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={isExportingJson}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 shadow-2xs transition-all cursor-pointer"
          >
            <FileJson className="h-3.5 w-3.5 text-zinc-500" />
            <span>{isExportingJson ? t('settings.exportingBackup') : t('options.storage.exportJsonBtn')}</span>
          </button>
          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExportingZip}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 shadow-2xs transition-all cursor-pointer"
          >
            <Download className={`h-3.5 w-3.5 ${isExportingZip ? 'animate-bounce' : ''}`} />
            <span>{isExportingZip ? t('settings.exportingBackup') : t('options.storage.exportZipBtn')}</span>
          </button>
        </div>
      }
    >
      {/* 1. Storage Usage Overview Cards */}
      <ConfigSection
        title={t('options.storage.dbStatsTitle')}
        description={t('options.storage.dbStatsDesc')}
        icon={<Database className="h-4 w-4 text-emerald-600" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-4">
          <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60">
            <div className="flex items-center gap-2 text-zinc-500 mb-1">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('options.storage.pocketImages')}</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{itemsCount}</div>
            <span className="text-[11px] text-zinc-400">{t('options.storage.galleryItemsUnit')}</span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60">
            <div className="flex items-center gap-2 text-zinc-500 mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('options.storage.generationTasks')}</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{tasksCount}</div>
            <span className="text-[11px] text-zinc-400">{t('options.storage.taskHistoryUnit')}</span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60">
            <div className="flex items-center gap-2 text-zinc-500 mb-1">
              <Layers className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('options.storage.promptsLibrary')}</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{promptsCount}</div>
            <span className="text-[11px] text-zinc-400">{t('options.storage.promptsCountUnit')}</span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60">
            <div className="flex items-center gap-2 text-zinc-500 mb-1">
              <HardDrive className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('options.storage.storageUsed')}</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{estimate.usedFormatted}</div>
            <span className="text-[11px] text-zinc-400">
              {estimate.quotaFormatted ? `${t('options.storage.storageLimit')} ${estimate.quotaFormatted}` : t('options.storage.noLimit')}
            </span>
          </div>
        </div>
      </ConfigSection>

      {/* 2. Full Backup & Offline Export */}
      <ConfigSection
        title={t('options.storage.offlineExportTitle')}
        description={t('options.storage.offlineExportDesc')}
        icon={<Archive className="h-4 w-4 text-sky-600" />}
        actions={
          actionSuccessMsg ? (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span>{actionSuccessMsg}</span>
            </span>
          ) : actionErrorMsg ? (
            <span className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              <span>{actionErrorMsg}</span>
            </span>
          ) : null
        }
      >
        {/* Hierarchical ZIP Archive */}
        <ConfigItem
          title={t('options.storage.zipBackupTitle')}
          description={t('options.storage.zipBackupDesc')}
        >
          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExportingZip}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExportingZip ? t('settings.exportingBackup') : t('options.storage.exportZipBtn')}</span>
          </button>
        </ConfigItem>

        {/* Lightweight JSON Metadata */}
        <ConfigItem
          title={t('options.storage.jsonBackupTitle')}
          description={t('options.storage.jsonBackupDesc')}
        >
          <button
            type="button"
            onClick={handleExportJson}
            disabled={isExportingJson}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span>{isExportingJson ? t('settings.exportingBackup') : t('options.storage.exportJsonBtn')}</span>
          </button>
        </ConfigItem>

        {/* Restore from JSON Backup */}
        <ConfigItem
          title={t('options.storage.restoreTitle')}
          description={t('options.storage.restoreDesc')}
        >
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Upload className={`h-3.5 w-3.5 ${isRestoring ? 'animate-bounce' : ''}`} />
              <span>{isRestoring ? t('options.storage.restoring') : t('options.storage.selectFileBtn')}</span>
            </button>
          </div>
        </ConfigItem>
      </ConfigSection>
    </ConfigLayout>
  );
};
