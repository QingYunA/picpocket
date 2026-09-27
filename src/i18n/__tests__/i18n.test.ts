import { describe, it, expect, beforeEach } from 'vitest';
import { zh } from '../locales/zh';
import { en } from '../locales/en';
import { getTranslation } from '../index';
import { getDefaultLanguage, getUserSettings, saveUserSettings, onLanguageChange } from '../../utils/storage';

import fs from 'fs';
import path from 'path';

function getKeysRecursively(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getKeysRecursively(v, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== '__tests__' && file !== 'node_modules' && file !== '.wxt') {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Exclude locale dictionary definition files themselves
      if (!fullPath.includes('/locales/')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

describe('i18n Localization', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should have symmetrical keys between zh and en locale dictionaries', () => {
    const zhKeys = getKeysRecursively(zh).sort();
    const enKeys = getKeysRecursively(en).sort();

    expect(enKeys).toEqual(zhKeys);
  });

  it('should ensure all static keys used across source components exist in locale dictionary', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const sourceFiles = getAllSourceFiles(srcDir);
    const keySet = new Set<string>();

    // Matches t('key.path') or getTranslation(lang, 'key.path')
    const keyRegex = /\b(?:t|getTranslation)\(\s*(?:[^,'"]+,\s*)?['"]([a-zA-Z0-9_.]+)['"]/g;

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = keyRegex.exec(content)) !== null) {
        const key = match[1];
        // Ignore test dummy keys or non-dot keys if any
        if (key && key.includes('.')) {
          keySet.add(key);
        }
      }
    }

    const zhKeys = new Set(getKeysRecursively(zh));
    const missingKeys: string[] = [];

    for (const key of keySet) {
      if (!zhKeys.has(key)) {
        missingKeys.push(key);
      }
    }

    expect(
      missingKeys,
      `Found translation keys used in source code that are missing in zh.ts: ${missingKeys.join(', ')}`
    ).toEqual([]);
  });

  it('should return correct translations for zh and en', () => {
    expect(getTranslation('zh', 'common.save')).toBe('保存配置');
    expect(getTranslation('en', 'common.save')).toBe('Save Settings');

    expect(getTranslation('zh', 'header.capture')).toBe('截图采集');
    expect(getTranslation('en', 'header.capture')).toBe('Capture');
  });

  it('should support dynamic parameter interpolation', () => {
    expect(getTranslation('zh', 'footer.syncedItems', { count: 42 })).toBe(
      '已收录 42 张 · Dexie 本地持久化'
    );
    expect(getTranslation('en', 'footer.syncedItems', { count: 42 })).toBe(
      '42 items in pocket · Local Dexie DB'
    );

    expect(getTranslation('zh', 'inspector.latency', { ms: 120 })).toBe(
      '耗时 120ms · 100% 全分辨率'
    );
    expect(getTranslation('en', 'inspector.latency', { ms: 120 })).toBe(
      'Took 120ms · 100% Full Resolution'
    );
  });

  it('should fallback to zh when en key is missing or undefined', () => {
    // Non-existent key should return path
    expect(getTranslation('en', 'non.existent.path')).toBe('non.existent.path');
  });

  it('should determine default language based on navigator environment', () => {
    const lang = getDefaultLanguage();
    expect(['zh', 'en']).toContain(lang);
  });

  it('should persist and retrieve language setting in storage', async () => {
    // Initial state
    const initial = await getUserSettings();
    expect(['zh', 'en']).toContain(initial.language);

    // Update language to en
    const updated = await saveUserSettings({ language: 'en' });
    expect(updated.language).toBe('en');

    // Retrieve again to confirm persistence
    const reloaded = await getUserSettings();
    expect(reloaded.language).toBe('en');

    // Switch back to zh
    await saveUserSettings({ language: 'zh' });
    const backToZh = await getUserSettings();
    expect(backToZh.language).toBe('zh');
  });
});
