import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, saveReferenceAsset, getReferenceAsset, deleteReferenceAsset, calculateDataUrlHash } from '../index';

describe('Reference Asset Pool (Dexie Single-Instance Deduplication)', () => {
  beforeEach(async () => {
    if (db.referenceAssets) {
      await db.referenceAssets.clear();
    }
  });

  it('should calculate consistent SHA-256 hash for identical data URLs', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const hash1 = await calculateDataUrlHash(sampleDataUrl);
    const hash2 = await calculateDataUrlHash(sampleDataUrl);

    expect(hash1).toBeTruthy();
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string length
  });

  it('should deduplicate identical reference images in the pool', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const id1 = await saveReferenceAsset(sampleDataUrl);
    const countAfterFirst = await db.referenceAssets.count();
    expect(countAfterFirst).toBe(1);

    // Call saveReferenceAsset again with identical image
    const id2 = await saveReferenceAsset(sampleDataUrl);
    const countAfterSecond = await db.referenceAssets.count();

    expect(id2).toBe(id1);
    expect(countAfterSecond).toBe(1); // Deduped! No duplicate entry created
  });

  it('should retrieve original data URL with 100% fidelity without compression', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const id = await saveReferenceAsset(sampleDataUrl);

    const retrieved = await getReferenceAsset(id);
    expect(retrieved).toBe(sampleDataUrl);
  });

  it('should delete reference asset by hash ID', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const id = await saveReferenceAsset(sampleDataUrl);
    expect(await db.referenceAssets.count()).toBe(1);

    await deleteReferenceAsset(id);
    expect(await db.referenceAssets.count()).toBe(0);
    expect(await getReferenceAsset(id)).toBeUndefined();
  });

  it('should support batch saving and batch retrieval with deduplication', async () => {
    const img1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const img2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/nwEDjBjwGAQA980D+W+V0BMAAAAASUVORK5CYII=';

    // Save batch with duplicate
    const ids = await import('../index').then((m) => m.saveReferenceAssets([img1, img2, img1]));
    expect(ids.length).toBe(3);
    expect(ids[0]).toBe(ids[2]); // Same content, same ID

    const count = await db.referenceAssets.count();
    expect(count).toBe(2); // Only 2 unique assets stored

    // Batch retrieval
    const retrieved = await import('../index').then((m) =>
      m.getReferenceAssets([ids[0]!, ids[1]!])
    );
    expect(retrieved.length).toBe(2);
    expect(retrieved[0]).toBe(img1);
    expect(retrieved[1]).toBe(img2);
  });
});
