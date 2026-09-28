/**
 * Chrome 应用商店禁止 MV3 扩展包含远程托管代码（曾因画布内置的 GA4 加载器被拒）。
 * 构建后扫描产物，发现远程脚本加载特征即失败，防止上游依赖再次带入。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'dist/chrome-mv3';
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'Google Tag Manager / GA4 loader', pattern: /googletagmanager\.com/ },
  { name: 'Baidu Analytics loader', pattern: /hm\.baidu\.com\/hm\.js/ },
  { name: 'importScripts from a remote URL', pattern: /importScripts\(\s*["'`]https?:/ },
  { name: 'dynamic import from a remote URL', pattern: /import\(\s*["'`]https?:/ },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const violations = walk(OUT_DIR)
  .filter((file) => /\.(m?js|html)$/.test(file))
  .flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(({ name }) => `${file}: ${name}`);
  });

if (violations.length > 0) {
  console.error('❌ 构建产物包含远程托管代码，Chrome 应用商店会拒绝：');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('✅ 远程代码扫描通过');
