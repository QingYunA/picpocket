import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readZipArchive } from '../zipReader';
import { createZipArchive } from '../../services/storageBackup';

const text = (s: string) => new TextEncoder().encode(s);

/** 构造一个只含单个 deflate 条目的 ZIP，模拟用户用系统工具重新压缩过的备份 */
function buildDeflateZip(name: string, content: Uint8Array): ArrayBuffer {
  const nameBytes = text(name);
  const packed = new Uint8Array(deflateRawSync(content));
  const local = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, packed.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  const cd = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, packed.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  cd.set(nameBytes, 46);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, cd.length, true);
  ev.setUint32(16, local.length + packed.length, true);
  const out = new Uint8Array(local.length + packed.length + cd.length + eocd.length);
  out.set(local, 0);
  out.set(packed, local.length);
  out.set(cd, local.length + packed.length);
  out.set(eocd, local.length + packed.length + cd.length);
  return out.buffer;
}

describe('readZipArchive', () => {
  it('reads back every entry written by createZipArchive, including UTF-8 names', async () => {
    const blob = createZipArchive([
      { name: 'manifest.json', data: text('{"version":2}') },
      { name: 'gallery/图片 1.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = await readZipArchive(await blob.arrayBuffer());
    expect(new TextDecoder().decode(files.get('manifest.json'))).toBe('{"version":2}');
    expect(Array.from(files.get('gallery/图片 1.png')!)).toEqual([1, 2, 3]);
  });

  it('inflates deflate-compressed entries', async () => {
    const content = text('hello '.repeat(200));
    const files = await readZipArchive(buildDeflateZip('a.txt', content));
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello '.repeat(200));
  });

  it('rejects data that is not a ZIP archive', async () => {
    await expect(readZipArchive(text('{"not":"zip"}').buffer as ArrayBuffer)).rejects.toThrow();
  });
});
