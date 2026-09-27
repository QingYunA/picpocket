import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { mirrorDistToMainWorktree } from './mirror-dist';

const syncOnly = process.argv.includes('--sync-only');

function run(cmd: string, silent = false): string {
  try {
    const res = execSync(cmd, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return res ? res.toString().trim() : '';
  } catch (err: any) {
    if (silent) return '';
    throw err;
  }
}

function runSilent(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

console.log('\n\x1b[1m\x1b[36m[PicPocket Worktree Sync]\x1b[0m 正在检查远端更新...');

// 1. Check current branch
const currentBranch = runSilent('git rev-parse --abbrev-ref HEAD') || 'main';
console.log(`\x1b[90m当前工作区分支: ${currentBranch}\x1b[0m`);

// 2. Fetch remote main
console.log('\x1b[90m正在拉取 origin/main 远端分支最新索引...\x1b[0m');
run('git fetch origin main');

// 3. Compare local HEAD with origin/main
const behindCountStr = runSilent(`git rev-list --count HEAD..origin/main`);
const behindCount = parseInt(behindCountStr, 10) || 0;

if (behindCount > 0) {
  console.log(`\n\x1b[33m⚡ 发现远端有 ${behindCount} 个新提交！正在同步并 rebase 合并...\x1b[0m`);
  
  // Show new commit titles
  const newCommits = runSilent(`git log --oneline -n ${Math.min(behindCount, 5)} origin/main`);
  if (newCommits) {
    console.log('\x1b[90m' + newCommits.split('\n').map(l => `  • ${l}`).join('\n') + '\x1b[0m\n');
  }

  // Check if working tree has dirty uncommitted files
  const status = runSilent('git status --porcelain');
  let hasStash = false;
  if (status) {
    console.log('\x1b[90m发现本地工作区存在未提交改动，临时暂存保护 (git stash -u)...\x1b[0m');
    run('git stash -u');
    hasStash = true;
  }

  // Rebase onto origin/main
  try {
    run(`git pull --rebase origin main`);
  } catch (err) {
    if (hasStash) {
      console.warn('\x1b[33m提示：同步过程中遇到中断，正在尝试恢复本地暂存...\x1b[0m');
      try { run('git stash pop'); } catch {}
    }
    throw err;
  }

  if (hasStash) {
    console.log('\x1b[90m恢复本地工作区暂存 (git stash pop)...\x1b[0m');
    run('git stash pop');
  }

  console.log('\x1b[32m✔ 远端最新代码已成功同步集成至当前工作区！\x1b[0m');
} else {
  console.log('\x1b[32m✔ 本地工作区与远端 origin/main 已保持最新，无需额外拉取。\x1b[0m');
}

if (!syncOnly) {
  console.log('\n\x1b[1m\x1b[36m[PicPocket Build]\x1b[0m 正在运行类型检查、自动化测试与扩展构建...\n');
  
  // 0. Ensure dependencies are up to date
  console.log('\x1b[90m确保项目依赖保持最新 (bun install)...\x1b[0m');
  run('bun install', true);

  // 1. Ensure .wxt directory and type definitions exist
  if (!fs.existsSync('.wxt/tsconfig.json')) {
    console.log('\x1b[90m未检测到 .wxt 运行时类型定义，正在生成 (wxt prepare)...\x1b[0m');
    run('bunx wxt prepare', true);
  }

  // 1. Run typecheck to prevent any silent compilation errors
  console.log('\x1b[90m运行全量 TypeScript 类型校验...\x1b[0m');
  run('bun run typecheck');

  // 2. Run i18n static consistency check
  console.log('\x1b[90m运行 i18n 双语字典与源码全量静态扫描...\x1b[0m');
  run('bun run i18n:check');

  // 3. Run unit tests
  console.log('\x1b[90m运行 Vitest 单元测试...\x1b[0m');
  run('bun run test');

  // 4. Build extension
  run('bun run build');

  // 4. Auto-mirror to main worktree so Chrome extension works immediately regardless of which directory was picked
  mirrorDistToMainWorktree();

  console.log('\n\x1b[1m\x1b[32m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m 🎉 Chrome 扩展产物已基于最新远端代码更新！\x1b[0m');
  console.log('\x1b[90m 输出目录: dist/chrome-mv3\x1b[0m');
  console.log('\x1b[33m 请在 Chrome 扩展管理页 (chrome://extensions/) 点击刷新图标即可使用最新版。\x1b[0m');
  console.log('\x1b[1m\x1b[32m========================================================\x1b[0m\n');
}
