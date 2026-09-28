import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import {
  getStorageEstimate,
  exportAllDataAsBackup,
  exportMetadataAsJsonBackup,
  restoreFromBackupJson,
  dataUrlToUint8Array,
  calculateCrc32,
  createZipArchive,
} from '../storageBackup';

describe('Storage and Backup Service', () => {
  beforeEach(async () => {
    if (db.items) await db.items.clear();
    if (db.generationTasks) await db.generationTasks.clear();
    if (db.folders) await db.folders.clear();
    if (db.referenceAssets) await db.referenceAssets.clear();
    if (db.promptSources) await db.promptSources.clear();
  });

  describe('Utility & Binary Decoders', () => {
    it('dataUrlToUint8Array should correctly decode valid base64 dataUrl', () => {
      const dataUrl = 'data:text/plain;base64,aGVsbG8gd29ybGQ='; // 'hello world'
      const bytes = dataUrlToUint8Array(dataUrl);
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('hello world');
    });

    it('dataUrlToUint8Array should handle invalid dataUrl gracefully', () => {
      const bytes = dataUrlToUint8Array('invalid-string-without-comma');
      expect(bytes.length).toBe(0);
    });

    it('calculateCrc32 should produce standard IEEE 802.3 CRC-32 checksums', () => {
      const sample = new TextEncoder().encode('123456789');
      // Standard CRC-32 for "123456789" is 0xCBF43926 (3421780262)
      expect(calculateCrc32(sample)).toBe(3421780262);

      const empty = new Uint8Array(0);
      expect(calculateCrc32(empty)).toBe(0);
    });

    it('createZipArchive should generate valid RFC 1950/PKWARE ZIP structure', async () => {
      const testContent = new TextEncoder().encode('Hello PicPocket Zip');
      const entries = [
        { name: 'test.txt', data: testContent },
        { name: 'subfolder/nested.txt', data: testContent },
      ];

      const zipBlob = createZipArchive(entries);
      expect(zipBlob.type).toBe('application/zip');
      expect(zipBlob.size).toBeGreaterThan(0);

      const buffer = await zipBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Verify Local File Header signature (0x04034b50 -> 'PK\x03\x04')
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(bytes[2]).toBe(0x03);
      expect(bytes[3]).toBe(0x04);

      // Verify file contains Central Directory signature (0x02014b50 -> 'PK\x01\x02')
      const hasCentralDir = bytes.some(
        (_, i) =>
          bytes[i] === 0x50 &&
          bytes[i + 1] === 0x4b &&
          bytes[i + 2] === 0x01 &&
          bytes[i + 3] === 0x02
      );
      expect(hasCentralDir).toBe(true);

      // Verify file ends with EOCD signature (0x06054b50 -> 'PK\x05\x06')
      const hasEocd = bytes.some(
        (_, i) =>
          bytes[i] === 0x50 &&
          bytes[i + 1] === 0x4b &&
          bytes[i + 2] === 0x05 &&
          bytes[i + 3] === 0x06
      );
      expect(hasEocd).toBe(true);
    });
  });

  describe('Storage Estimation & Full Backup Export', () => {
    it('should return valid storage estimation structure', async () => {
      const est = await getStorageEstimate();
      expect(est).toBeDefined();
      expect(typeof est.usedFormatted).toBe('string');
      expect(typeof est.percent).toBe('number');
    });

    it('should export database payload and trigger download with hierarchical folders', async () => {
      // Add sample gallery item
      const fakeBlob = new Blob(['sample data'], { type: 'image/png' });
      await db.items.add({
        originalBlob: fakeBlob,
        createdAt: Date.now(),
        tags: ['Test'],
        status: 'pending',
      });

      // Add sample generation task with generated images
      await db.generationTasks.add({
        id: 'task_test_backup',
        prompt: 'A futuristic cat',
        aspectRatio: '1:1',
        model: 'test-model',
        images: [
          {
            id: 'img_1',
            prompt: 'A futuristic cat',
            aspectRatio: '1:1',
            width: 1024,
            height: 1024,
            createdAt: Date.now(),
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
        status: 'success',
        createdAt: Date.now(),
      });

      // Add sample reference asset in deduplication pool
      await db.referenceAssets.add({
        id: 'ref_hash_123',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        createdAt: Date.now(),
      });

      // Type-safe document mock
      let downloadedUrl = '';
      let downloadedFilename = '';
      const mockAnchor = {
        href: '',
        download: '',
        click() {
          downloadedUrl = this.href;
          downloadedFilename = this.download;
        },
      };
      const mockDoc = {
        createElement: (tagName: string) => {
          if (tagName === 'a') return mockAnchor;
          return {};
        },
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      };
      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        configurable: true,
        writable: true,
      });

      await db.promptSources.put({
        id: 'test_source',
        name: '测试源',
        url: 'https://example.com/source.json',
        homepage: 'https://example.com',
        enabled: true,
        builtIn: false,
      });

      const resultZip = await exportAllDataAsBackup();
      expect(resultZip.count).toBeGreaterThanOrEqual(4);
      expect(resultZip.filename).toContain('PicPocket_Backup_');
      expect(resultZip.filename).toContain('.zip');
      expect(downloadedFilename).toBe(resultZip.filename);
      expect(downloadedUrl).toBeTruthy();

      // Test standalone lightweight JSON metadata export
      const metaJson = await exportMetadataAsJsonBackup();
      expect(metaJson.filename).toContain('PicPocket_Backup_');
      expect(metaJson.filename).toContain('.json');
    });

    it('restoreFromBackupJson should parse and restore settings, folders, and prompt items', async () => {
      const backupPayload = {
        appName: 'PicPocket',
        version: '1.0.0',
        exportedAt: Date.now(),
        settings: {
          defaultImageAspectRatio: '16:9',
          autoAnalyzeOnCapture: true,
        },
        folders: [
          { name: 'Architecture Photography', parentId: null, order: 1 },
        ],
        promptItems: [
          {
            title: 'Cinematic Cyberpunk Street',
            prompt: 'masterpiece, neon glow, wet asphalt, 8k resolution',
            tags: ['cyberpunk', 'city'],
          },
        ],
      };

      const res = await restoreFromBackupJson(JSON.stringify(backupPayload));
      expect(res.settingsRestored).toBe(true);
      expect(res.foldersRestored).toBe(1);
      expect(res.promptsRestored).toBe(1);

      // Verify records exist in IndexedDB
      const folder = await db.folders.where('name').equals('Architecture Photography').first();
      expect(folder).toBeTruthy();

      const prompt = await db.promptItems.where('title').equals('Cinematic Cyberpunk Street').first();
      expect(prompt).toBeTruthy();
      expect(prompt?.prompt).toContain('neon glow');
      expect(prompt?.sourceId).toBe('backup-restore');

      // Testing invalid JSON format rejection
      await expect(restoreFromBackupJson('invalid-json-content')).rejects.toThrow('Invalid JSON format');
      await expect(restoreFromBackupJson('"primitive-string"')).rejects.toThrow('Invalid backup file structure');
    });
  });
});
