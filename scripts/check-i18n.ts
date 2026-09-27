#!/usr/bin/env bun
/**
 * PicPocket i18n Validation & Scaffold Tool
 * 
 * 作用：
 * 1. 双向对比 zh.ts 与 en.ts 键名对称性；
 * 2. 扫描 src 源码中所有静态 t('...') 引用，检查是否在字典中全部注册；
 * 3. 自动生成漏定义键的补全代码模版。
 */

import fs from 'fs';
import path from 'path';
import { zh } from '../src/i18n/locales/zh';
import { en } from '../src/i18n/locales/en';

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
      if (file !== '__tests__' && file !== 'node_modules' && file !== '.wxt' && file !== 'dist') {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      if (!fullPath.includes('/locales/')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function run() {
  console.log('🌐 [PicPocket i18n Checker] 开始全量静态文案扫描...\n');

  const zhKeys = getKeysRecursively(zh);
  const enKeys = getKeysRecursively(en);
  const zhSet = new Set(zhKeys);
  const enSet = new Set(enKeys);

  let hasError = false;

  // 1. Check Symmetry
  const onlyInZh = zhKeys.filter((k) => !enSet.has(k));
  const onlyInEn = enKeys.filter((k) => !zhSet.has(k));

  if (onlyInZh.length > 0) {
    hasError = true;
    console.error(`❌ [不对称] 以下键名仅存在于 zh.ts，缺少 en.ts 对应翻译:`);
    onlyInZh.forEach((k) => console.error(`   - ${k}`));
  }

  if (onlyInEn.length > 0) {
    hasError = true;
    console.error(`❌ [不对称] 以下键名仅存在于 en.ts，缺少 zh.ts 对应翻译:`);
    onlyInEn.forEach((k) => console.error(`   - ${k}`));
  }

  // 2. Scan Source Code References
  const srcDir = path.resolve(import.meta.dirname, '../src');
  const sourceFiles = getAllSourceFiles(srcDir);
  const codeKeyMap = new Map<string, string[]>(); // key -> file paths
  const keyRegex = /\b(?:t|getTranslation)\(\s*(?:[^,'"]+,\s*)?['"]([a-zA-Z0-9_.]+)['"]/g;

  for (const file of sourceFiles) {
    const relPath = path.relative(path.resolve(import.meta.dirname, '..'), file);
    const content = fs.readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(content)) !== null) {
      const key = match[1];
      if (key && key.includes('.')) {
        if (!codeKeyMap.has(key)) {
          codeKeyMap.set(key, []);
        }
        codeKeyMap.get(key)!.push(relPath);
      }
    }
  }

  const missingInZh: { key: string; files: string[] }[] = [];
  const missingInEn: { key: string; files: string[] }[] = [];

  for (const [key, files] of codeKeyMap.entries()) {
    if (!zhSet.has(key)) {
      missingInZh.push({ key, files: Array.from(new Set(files)) });
    }
    if (!enSet.has(key)) {
      missingInEn.push({ key, files: Array.from(new Set(files)) });
    }
  }

  if (missingInZh.length > 0 || missingInEn.length > 0) {
    hasError = true;
    console.error(`\n❌ [源码漏定义] 源码中调用了未经注册的 i18n 键名:`);
    const allMissing = Array.from(new Set([...missingInZh.map((m) => m.key), ...missingInEn.map((m) => m.key)]));
    for (const k of allMissing) {
      const files = codeKeyMap.get(k) || [];
      console.error(`   - ${k}  (调用位置: ${files.slice(0, 2).join(', ')}${files.length > 2 ? ' 等' : ''})`);
    }

    console.log('\n💡 [自动补全建议模版 (可复制到 zh.ts 与 en.ts)]:');
    console.log('// --- zh.ts ---');
    allMissing.forEach((k) => {
      const leaf = k.split('.').pop();
      console.log(`    ${leaf}: 'TODO: 中文文案', // ${k}`);
    });
    console.log('// --- en.ts ---');
    allMissing.forEach((k) => {
      const leaf = k.split('.').pop();
      console.log(`    ${leaf}: 'TODO: English copy', // ${k}`);
    });
  }

  // 3. Scan for Fragile Reverse-Inspection Anti-Pattern (e.g. t(...) === 'xxx')
  const fragileInspectionRegex = /\bt\([^)]+\)\s*[!=]==?\s*['"`]/;
  const fragileViolations: { file: string; line: number; snippet: string }[] = [];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((lineText, idx) => {
      if (fragileInspectionRegex.test(lineText)) {
        const relPath = path.relative(path.resolve(import.meta.dirname, '..'), file);
        fragileViolations.push({ file: relPath, line: idx + 1, snippet: lineText.trim() });
      }
    });
  }

  if (fragileViolations.length > 0) {
    hasError = true;
    console.error(`\n❌ [规范违规] 检测到向 t(...) 反查字面值的脆弱反模式 (严禁使用 t(...) === 'xxx' 判定状态，必须直接使用 language === 'zh'):`);
    fragileViolations.forEach((v) => console.error(`   - ${v.file}:${v.line} -> ${v.snippet}`));
  }

  // Summary
  console.log('\n📊 扫描统计结果:');
  console.log(`   • 中文字典键数 (zh.ts): ${zhKeys.length}`);
  console.log(`   • 英文字典键数 (en.ts): ${enKeys.length}`);
  console.log(`   • 源码扫描文件数:       ${sourceFiles.length}`);
  console.log(`   • 源码静态引用键数:     ${codeKeyMap.size}`);

  if (hasError) {
    console.error('\n🚨 i18n 静态校验未通过，请根据上方提示修复！');
    process.exit(1);
  } else {
    console.log('\n✅ i18n 静态校验全量通过！双语完全对称且无漏注册键。');
    process.exit(0);
  }
}

run();
