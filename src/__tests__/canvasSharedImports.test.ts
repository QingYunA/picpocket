import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const canvasSrc = path.join(root, 'vendor/infinite-canvas/web/src');
const extensionSrc = path.join(root, 'src');

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveFile(base: string): string | null {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  return null;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** 运行期导入（不含 import type）的模块说明符 */
function runtimeSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:import|export)\s+(?!type\b)[^;'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/gs;
  for (const match of source.matchAll(pattern)) specifiers.push((match[1] ?? match[2])!);
  return specifiers;
}

describe('extension modules shared with the canvas bundle', () => {
  // 画布打包时 '@' 指向画布自己的 src，被画布引用的扩展文件若用 '@/' 导入，会静默解析到错误位置
  it('never use the "@/" alias at runtime anywhere in their import chain', () => {
    const queue: string[] = [];
    for (const file of walk(canvasSrc)) {
      for (const spec of runtimeSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('@picpocket/')) continue;
        const resolved = resolveFile(path.join(extensionSrc, spec.slice('@picpocket/'.length)));
        if (resolved) queue.push(resolved);
      }
    }
    expect(queue.length).toBeGreaterThan(0);

    const seen = new Set<string>();
    const violations: string[] = [];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of runtimeSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('@/')) violations.push(`${path.relative(root, file)} → ${spec}`);
        else if (spec.startsWith('.')) {
          const resolved = resolveFile(path.resolve(path.dirname(file), spec));
          if (resolved) queue.push(resolved);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
