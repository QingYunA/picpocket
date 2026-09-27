import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function getGitCommonDir(): string {
  try {
    return execSync('git rev-parse --path-format=absolute --git-common-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export function mirrorDistToMainWorktree() {
  const currentWorkdir = process.cwd();
  const gitCommonDir = getGitCommonDir();

  if (!gitCommonDir) {
    console.log('[PicPocket Mirror] 未检测到 Git 仓库，跳过产物镜像。');
    return;
  }

  // The main worktree root is the parent of .git common dir
  const mainRepoRoot = path.dirname(gitCommonDir);

  // If we are already in the main repo root, no need to mirror
  if (path.resolve(currentWorkdir) === path.resolve(mainRepoRoot)) {
    console.log('\x1b[90m[PicPocket Mirror] 当前已在主工作区，产物已就位。\x1b[0m');
    return;
  }

  const currentDist = path.join(currentWorkdir, 'dist', 'chrome-mv3');
  const targetDist = path.join(mainRepoRoot, 'dist', 'chrome-mv3');

  if (!fs.existsSync(currentDist)) {
    console.warn(`\x1b[33m[PicPocket Mirror] 当前工作树产物目录不存在: ${currentDist}\x1b[0m`);
    return;
  }

  fs.mkdirSync(targetDist, { recursive: true });

  console.log('\n\x1b[1m\x1b[36m[PicPocket Worktree Auto-Mirror]\x1b[0m 检测到处于独立工作树分支！');
  console.log(`\x1b[90m来源工作树: ${currentWorkdir}\x1b[0m`);
  console.log(`\x1b[90m目标调试目录: ${targetDist}\x1b[0m`);

  try {
    execSync(`rsync -av --delete "${currentDist}/" "${targetDist}/"`, {
      stdio: 'pipe',
    });
    console.log(
      '\x1b[32m✔ 扩展产物已自动镜像同步至主仓库调试目录，Chrome 扩展无需重新选择路径！\x1b[0m\n'
    );
  } catch (err: any) {
    console.error('\x1b[31m✖ 产物自动镜像同步失败:\x1b[0m', err.message);
  }
}

if (import.meta.main) {
  mirrorDistToMainWorktree();
}
