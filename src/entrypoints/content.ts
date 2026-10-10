import { defineContentScript } from 'wxt/utils/define-content-script';
import { getTranslation } from '../i18n';
import { getUserSettings, getDefaultLanguage, onLanguageChange } from '../utils/storage';
import type { Language } from '../types';
import { inlineIcon } from '../utils/inlineIcons';

/** 后台 CAPTURE_IMAGE 的回包 */
type CaptureResponse = {
  success?: boolean;
  error?: string;
  item?: { id: number; folderId?: number; folderName?: string };
};

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    let currentLang: Language = getDefaultLanguage();
    getUserSettings().then((s) => {
      if (s.language) currentLang = s.language;
    });

    onLanguageChange((newLang) => {
      currentLang = newLang;
    });

    let activeBadge: HTMLElement | null = null;
    let activeBadgeSource: HTMLElement | null = null;
    let hoveredElement: HTMLElement | null = null;
    let hideTimer: any = null;
    let isHoverBadgeEnabled = true;

    // Read initial settings
    chrome.storage?.local?.get('promptsnap_settings', (res: { [key: string]: any }) => {
      if (res?.promptsnap_settings && typeof res.promptsnap_settings.enableHoverBadge === 'boolean') {
        isHoverBadgeEnabled = res.promptsnap_settings.enableHoverBadge;
      }
    });

    // Listen for setting changes
    chrome.storage?.onChanged?.addListener((changes: { [key: string]: any }, area: string) => {
      if (area === 'local' && changes.promptsnap_settings?.newValue) {
        const newSettings = changes.promptsnap_settings.newValue;
        if (typeof newSettings.enableHoverBadge === 'boolean') {
          isHoverBadgeEnabled = newSettings.enableHoverBadge;
          if (!isHoverBadgeEnabled) removeBadge();
        }
      }
    });

    function removeBadge() {
      if (activeBadge) {
        activeBadge.remove();
        activeBadge = null;
      }
      activeBadgeSource = null;
    }

    let activeToast: HTMLElement | null = null;

    function showToast(text: string, variant: 'success' | 'error' = 'success') {
      // 连续触发时只保留最新一条，避免多条提示叠在同一位置
      activeToast?.remove();

      // 同徽标：挂进 Shadow DOM 并重置宿主可继承样式，避免宿主页面的全局样式污染提示条
      const host = document.createElement('div');
      host.id = 'picpocket-toast-host';
      host.style.setProperty('all', 'initial');
      const shadow = host.attachShadow({ mode: 'open' });

      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.zIndex = '2147483647';
      toast.style.top = '20px';
      toast.style.right = '20px';
      toast.style.maxWidth = 'calc(100vw - 40px)';
      toast.style.boxSizing = 'border-box';
      toast.style.display = 'flex';
      toast.style.alignItems = 'center';
      toast.style.gap = '8px';
      toast.style.backgroundColor = '#18181B';
      toast.style.color = '#FFFFFF';
      toast.style.padding = '8px 14px';
      toast.style.borderRadius = '8px';
      toast.style.fontSize = '12px';
      toast.style.lineHeight = '1.5';
      toast.style.fontWeight = '500';
      toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.16)';
      toast.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      toast.style.pointerEvents = 'none';

      const icon = variant === 'error'
        ? inlineIcon('circleAlert', 14, '#F87171')
        : inlineIcon('check', 14, '#38BDF8');
      toast.innerHTML = icon;
      const label = document.createElement('span');
      label.textContent = text;
      toast.appendChild(label);

      shadow.appendChild(toast);
      // 挂在 <html> 下：body 带 transform / filter 的页面会让 position: fixed 相对 body 定位而错位
      document.documentElement.appendChild(host);
      activeToast = host;
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => {
          host.remove();
          if (activeToast === host) activeToast = null;
        }, 250);
      }, 2000);
    }

    function createBadge(target: HTMLImageElement | HTMLElement, src: string) {
      if (!isHoverBadgeEnabled) return;
      removeBadge();

      const rect = target.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) return;

      const badge = document.createElement('div');
      badge.id = 'promptsnap-capture-badge';
      badge.style.position = 'fixed';
      badge.style.zIndex = '2147483645';
      badge.style.top = `${Math.max(10, rect.top + 8)}px`;
      // fixed 定位相对于不含滚动条的视口，用 clientWidth 而不是 innerWidth，否则有滚动条的页面里徽标会左偏一个滚动条宽度
      badge.style.right = `${Math.max(10, document.documentElement.clientWidth - rect.right + 8)}px`;
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.backgroundColor = '#FFFFFF';
      badge.style.border = '1px solid #E4E4E7';
      badge.style.borderRadius = '9999px';
      badge.style.padding = '2px';
      badge.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
      badge.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      badge.style.userSelect = 'none';
      badge.style.transition = 'opacity 0.15s ease, transform 0.15s ease';

      // 1. Save only button (Left action)
      const saveBtn = document.createElement('button');
      saveBtn.style.display = 'flex';
      saveBtn.style.alignItems = 'center';
      saveBtn.style.gap = '4px';
      saveBtn.style.border = 'none';
      saveBtn.style.backgroundColor = 'transparent';
      saveBtn.style.color = '#52525B';
      saveBtn.style.borderRadius = '9999px';
      saveBtn.style.padding = '3px 8px';
      saveBtn.style.fontSize = '11px';
      saveBtn.style.fontWeight = '500';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.transition = 'all 0.12s ease';
      saveBtn.title = getTranslation(currentLang, 'content.saveBtnTitle');
      saveBtn.innerHTML = `
        ${inlineIcon('bookmark', 11)}
        <span>${getTranslation(currentLang, 'content.saveBtnText')}</span>
      `;
      saveBtn.addEventListener('mouseenter', () => {
        saveBtn.style.backgroundColor = '#F4F4F5';
        saveBtn.style.color = '#18181B';
      });
      saveBtn.addEventListener('mouseleave', () => {
        saveBtn.style.backgroundColor = 'transparent';
        saveBtn.style.color = '#52525B';
      });

      // Divider line
      const divider = document.createElement('div');
      divider.style.width = '1px';
      divider.style.height = '12px';
      divider.style.backgroundColor = '#E4E4E7';
      divider.style.margin = '0 1px';

      // 2. Save and analyze button (Right action)
      const analyzeBtn = document.createElement('button');
      analyzeBtn.style.display = 'flex';
      analyzeBtn.style.alignItems = 'center';
      analyzeBtn.style.gap = '4px';
      analyzeBtn.style.border = 'none';
      analyzeBtn.style.backgroundColor = 'transparent';
      analyzeBtn.style.color = '#18181B';
      analyzeBtn.style.borderRadius = '9999px';
      analyzeBtn.style.padding = '3px 9px';
      analyzeBtn.style.fontSize = '11px';
      analyzeBtn.style.fontWeight = '600';
      analyzeBtn.style.cursor = 'pointer';
      analyzeBtn.style.transition = 'all 0.12s ease';
      analyzeBtn.title = getTranslation(currentLang, 'content.analyzeBtnTitle');
      analyzeBtn.innerHTML = `
        ${inlineIcon('wandSparkles', 11, '#0284C7')}
        <span>${getTranslation(currentLang, 'content.analyzeBtnText')}</span>
      `;
      analyzeBtn.addEventListener('mouseenter', () => {
        analyzeBtn.style.backgroundColor = '#18181B';
        analyzeBtn.style.color = '#FFFFFF';
        const icon = analyzeBtn.querySelector('svg polygon');
        if (icon) icon.setAttribute('stroke', '#38BDF8');
      });
      analyzeBtn.addEventListener('mouseleave', () => {
        analyzeBtn.style.backgroundColor = 'transparent';
        analyzeBtn.style.color = '#18181B';
        const icon = analyzeBtn.querySelector('svg polygon');
        if (icon) icon.setAttribute('stroke', '#0284C7');
      });

      // Hover timing for parent capsule
      badge.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        badge.style.transform = 'scale(1.02)';
      });
      badge.addEventListener('mouseleave', () => {
        badge.style.transform = 'scale(1)';
        hideTimer = setTimeout(removeBadge, 500);
      });

      function handleCaptureFeedback(resp: CaptureResponse, autoAnalyze: boolean) {
        // 后台回包结构为 { success, item: { folderName } }
        const folderName = resp.item?.folderName;
        if (autoAnalyze) {
          showToast(
            folderName
              ? getTranslation(currentLang, 'webCapsule.savedAndAnalyzingTo', { folder: folderName })
              : getTranslation(currentLang, 'content.analyzeToast')
          );
        } else {
          showToast(
            folderName
              ? getTranslation(currentLang, 'webCapsule.savedTo', { folder: folderName })
              : getTranslation(currentLang, 'content.savedToast')
          );
        }
      }

      // Click: Save only
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (badge.dataset.busy === '1') return;
        badge.dataset.busy = '1';
        badge.style.opacity = '0.6';

        const saveResp = await requestCapture(src, false);
        if (saveResp?.success) {
          saveBtn.innerHTML = `
            ${inlineIcon('check', 11, '#059669')}
            <span style="color: #059669;">${getTranslation(currentLang, 'content.saveBtnClicked')}</span>
          `;
          handleCaptureFeedback(saveResp, false);
        } else {
          showCaptureFailure(saveResp);
        }

        setTimeout(removeBadge, 800);
      });

      // Click: Save & Analyze
      analyzeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (badge.dataset.busy === '1') return;
        badge.dataset.busy = '1';
        badge.style.opacity = '0.6';

        const analyzeResp = await requestCapture(src, true);
        if (analyzeResp?.success) {
          analyzeBtn.innerHTML = `
            ${inlineIcon('check', 11, '#0284C7')}
            <span style="color: #0284C7;">${getTranslation(currentLang, 'content.analyzeBtnClicked')}</span>
          `;
          handleCaptureFeedback(analyzeResp, true);
        } else {
          showCaptureFailure(analyzeResp);
        }

        setTimeout(removeBadge, 800);
      });

      badge.appendChild(saveBtn);
      badge.appendChild(divider);
      badge.appendChild(analyzeBtn);

      // 挂载进 Shadow DOM，隔离宿主页面的全局 button/span 样式污染
      const host = document.createElement('div');
      host.id = 'promptsnap-capture-badge-host';
      // 重置宿主可继承样式（font、line-height、letter-spacing 等会穿透 shadow 边界）
      host.style.setProperty('all', 'initial');
      host.attachShadow({ mode: 'open' }).appendChild(badge);
      document.documentElement.appendChild(host);
      activeBadge = host;
      activeBadgeSource = target;
    }

    /** 扩展被更新/重载后，页面里遗留的内容脚本无法再与后台通信，需要刷新页面 */
    const CONTEXT_INVALIDATED = 'EXTENSION_CONTEXT_INVALIDATED';

    function showCaptureFailure(resp: CaptureResponse | null) {
      const key = resp?.error === CONTEXT_INVALIDATED ? 'content.extensionUpdatedToast' : 'content.saveFailedToast';
      showToast(getTranslation(currentLang, key), 'error');
    }

    /** 以后台真实落库结果为准反馈，避免防盗链等失败被乐观提示掩盖；通信异常时返回 null */
    async function requestCapture(src: string, autoAnalyze: boolean): Promise<CaptureResponse | null> {
      if (!chrome.runtime?.id) return { success: false, error: CONTEXT_INVALIDATED };
      try {
        const resp = await chrome.runtime.sendMessage({
          action: 'CAPTURE_IMAGE',
          src,
          sourceUrl: window.location.href,
          pageTitle: document.title,
          autoAnalyze,
        });
        return (resp as CaptureResponse | undefined) ?? null;
      } catch (err) {
        if (String(err).includes('Extension context invalidated')) {
          return { success: false, error: CONTEXT_INVALIDATED };
        }
        console.warn('Failed to send capture message:', err);
        return null;
      }
    }

    /** 指针是否落在元素的可视矩形内（允许 1px 误差） */
    function pointerInside(el: Element, x: number, y: number): boolean {
      const r = el.getBoundingClientRect();
      return x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;
    }

    function extractImageSource(target: HTMLElement, x: number, y: number): { src: string; element: HTMLElement } | null {
      // 1. Direct <img>
      if (target.tagName === 'IMG') {
        const src = (target as HTMLImageElement).currentSrc || (target as HTMLImageElement).src;
        if (src && (src.startsWith('http') || src.startsWith('data:'))) {
          return { src, element: target };
        }
      }

      // 2. Direct child <img> (e.g. inside an <a> or wrapper div)
      // 子图必须正好在指针下：否则悬停在 body / 大容器空白处时，会对容器里的第一张图弹出徽标
      const childImg = target.querySelector('img');
      if (childImg && pointerInside(childImg, x, y)) {
        const src = childImg.currentSrc || childImg.src;
        if (src && (src.startsWith('http') || src.startsWith('data:'))) {
          return { src, element: childImg };
        }
      }

      // 3. Parent container (handles transparent click overlay divs)
      const parent = target.closest('figure, picture, a, div[role="img"], [data-testid], div');
      if (parent && parent !== document.body) {
        const nestedImg = parent.querySelector('img');
        if (nestedImg && pointerInside(nestedImg, x, y)) {
          const src = nestedImg.currentSrc || nestedImg.src;
          if (src && (src.startsWith('http') || src.startsWith('data:'))) {
            return { src, element: nestedImg };
          }
        }
      }

      // 4. Background-image
      // 可能是多层背景（url(a), linear-gradient(...)），只取第一个 url(...)
      const bg = window.getComputedStyle(target).backgroundImage;
      const bgUrl = bg && bg !== 'none' ? bg.match(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/) : null;
      const src = bgUrl ? (bgUrl[1] ?? bgUrl[2] ?? bgUrl[3] ?? '') : '';
      if (src && (src.startsWith('http') || src.startsWith('data:'))) {
        return { src, element: target };
      }

      return null;
    }

    // Hover image detection
    document.addEventListener(
      'mouseover',
      (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        const imgInfo = extractImageSource(target, e.clientX, e.clientY);
        if (imgInfo) {
          hoveredElement = target;
          clearTimeout(hideTimer);
          // 在同一张图上移动鼠标会不断触发 mouseover：已有徽标时不重建，避免闪烁并丢失点击中的忙碌状态
          if (activeBadge && activeBadgeSource === imgInfo.element) return;
          createBadge(imgInfo.element, imgInfo.src);
        }
      },
      true
    );

    // 徽标为 fixed 定位且仅在 hover 时计算一次坐标，滚动后会与图片错位，直接收起
    window.addEventListener('scroll', removeBadge, { capture: true, passive: true });

    document.addEventListener(
      'mouseout',
      (e) => {
        if (e.target === hoveredElement) {
          hideTimer = setTimeout(removeBadge, 600);
        }
      },
      true
    );

    // Webpage Quick-Filing Capsule (Shadow DOM)
    function showQuickFilingCapsule(
      itemId: number,
      folders: any[],
      pageTitle?: string,
      currentFolderId?: number | null,
      currentFolderName?: string,
      isAnalyzing = false
    ) {
      // Remove any existing host
      const existingHost = document.getElementById('picpocket-quick-filing-host');
      if (existingHost) existingHost.remove();

      const host = document.createElement('div');
      host.id = 'picpocket-quick-filing-host';
      // 先重置宿主可继承样式（字号、行高、字间距等会穿透 shadow 边界），再设定定位
      host.style.setProperty('all', 'initial');
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.bottom = '24px';
      host.style.right = '24px';
      host.style.pointerEvents = 'auto';

      const shadow = host.attachShadow({ mode: 'open' });

      // Flatten folder hierarchy for dropdown
      const roots = folders.filter((f) => f.parentId == null);
      const childMap = new Map<number, any[]>();
      folders.forEach((f) => {
        if (f.parentId != null) {
          if (!childMap.has(f.parentId)) childMap.set(f.parentId, []);
          childMap.get(f.parentId)!.push(f);
        }
      });

      const flatList: { id: number | null; name: string; depth: number }[] = [
        { id: null, name: getTranslation(currentLang, 'webCapsule.uncategorized'), depth: 0 },
      ];

      function traverse(node: any, depth: number) {
        flatList.push({ id: node.id, name: node.name, depth });
        const children = childMap.get(node.id) || [];
        children.forEach((c) => traverse(c, depth + 1));
      }
      roots.forEach((r) => traverse(r, 0));

      const style = document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .wrapper {
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
          opacity: 0;
          transform: translateY(8px) scale(0.98);
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .wrapper.show {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .capsule {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #18181b;
          border: 1px solid #27272a;
          color: #ffffff;
          padding: 5px 8px 5px 10px;
          border-radius: 9999px;
          box-shadow: 0 12px 28px -4px rgba(0,0,0,0.35);
          font-size: 12px;
          font-weight: 500;
        }
        .check-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 17px;
          height: 17px;
          border-radius: 9999px;
          background: #059669;
          color: #ffffff;
          flex-shrink: 0;
        }
        .check-icon.analyzing {
          background: #0284c7;
          animation: pulseIcon 1.5s infinite ease-in-out;
        }
        @keyframes pulseIcon {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        .saved-label {
          color: #ffffff;
          font-weight: 600;
          font-size: 11px;
          white-space: nowrap;
        }
        .folder-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #e4e4e7;
          border-radius: 9999px;
          padding: 3px 8px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
          max-width: 140px;
        }
        .folder-btn:hover {
          background: #3f3f46;
          color: #ffffff;
          border-color: #52525b;
        }
        .folder-btn-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #71717a;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.12s ease;
          font-size: 12px;
          margin-left: -2px;
        }
        .close-btn:hover {
          background: #27272a;
          color: #e4e4e7;
        }
        .dropdown {
          position: absolute;
          bottom: 38px;
          right: 0;
          min-width: 180px;
          max-width: min(280px, calc(100vw - 48px));
          max-height: 220px;
          overflow-y: auto;
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 10px;
          padding: 4px;
          box-shadow: 0 16px 36px rgba(0,0,0,0.5);
          display: none;
          flex-direction: column;
          gap: 2px;
          z-index: 10;
        }
        .dropdown.open {
          display: flex;
          animation: slideUp 0.15s ease-out;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 6px;
          color: #d4d4d8;
          font-size: 11px;
          cursor: pointer;
          transition: background 0.1s ease;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
        }
        .dropdown-item:hover {
          background: #27272a;
          color: #ffffff;
        }
        .dropdown-item.active {
          color: #38bdf8;
          font-weight: 600;
          background: rgba(39, 39, 42, 0.6);
        }
        .success-text {
          color: #34d399 !important;
          font-weight: 600;
        }
      `;

      shadow.appendChild(style);

      const wrapper = document.createElement('div');
      wrapper.className = 'wrapper';

      const capsule = document.createElement('div');
      capsule.className = 'capsule';

      const initialFolderName = currentFolderName || getTranslation(currentLang, 'webCapsule.uncategorized');
      const savedText = isAnalyzing
        ? getTranslation(currentLang, 'webCapsule.savedAndAnalyzing')
        : getTranslation(currentLang, 'webCapsule.saved');

      const iconHtml = isAnalyzing
        ? `<div class="check-icon analyzing">
            ${inlineIcon('wandSparkles', 10)}
          </div>`
        : `<div class="check-icon">
            ${inlineIcon('check', 10)}
          </div>`;

      capsule.innerHTML = `
        ${iconHtml}
        <span class="saved-label">${savedText}</span>
        <button class="folder-btn" id="folder-trigger" title="${getTranslation(currentLang, 'webCapsule.changeFolder')}">
          ${inlineIcon('folder', 11)}
          <span class="folder-btn-text" id="folder-label"></span>
          ${inlineIcon('chevronDown', 9)}
        </button>
        <button class="close-btn" id="close-btn" title="${getTranslation(currentLang, 'common.close')}">${inlineIcon('x', 11)}</button>
      `;

      // 文件夹名是用户输入（也可能来自导入的备份），必须以文本节点写入，不能拼进 innerHTML
      const initialLabel = capsule.querySelector('#folder-label');
      if (initialLabel) initialLabel.textContent = initialFolderName;

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown';

      flatList.forEach((item) => {
        const btn = document.createElement('button');
        const isActive = (item.id === currentFolderId) || (item.id === null && !currentFolderId);
        btn.className = `dropdown-item${isActive ? ' active' : ''}`;
        btn.style.paddingLeft = `${item.depth * 12 + 8}px`;
        btn.innerHTML = inlineIcon(item.id == null ? 'inbox' : 'folder', 12);
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        nameEl.textContent = item.name;
        btn.title = item.name;
        btn.appendChild(nameEl);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Update item folder in background；扩展刚更新时旧页面的上下文已失效，消息发送可能同步抛错
          try {
            chrome.runtime
              .sendMessage({ action: 'UPDATE_ITEM_FOLDER', itemId, folderId: item.id })
              .catch(() => {});
          } catch {
            // 忽略：下次保存时会提示刷新页面
          }

          const label = shadow.getElementById('folder-label');
          if (label) {
            label.textContent = item.name;
            label.className = 'folder-btn-text success-text';
          }
          dropdown.classList.remove('open');

          // Smoothly dismiss after 1.2s
          setTimeout(dismiss, 1200);
        });
        dropdown.appendChild(btn);
      });

      wrapper.appendChild(dropdown);
      wrapper.appendChild(capsule);
      shadow.appendChild(wrapper);
      document.documentElement.appendChild(host);

      requestAnimationFrame(() => {
        wrapper.classList.add('show');
      });

      // Timer & Hover pause logic
      let remainingMs = 3200;
      let startTime = Date.now();
      let timer: any = null;
      let isPaused = false;
      let isHovered = false;

      function startTimer() {
        startTime = Date.now();
        timer = setTimeout(dismiss, remainingMs);
        isPaused = false;
      }

      function pauseTimer() {
        if (isPaused) return;
        clearTimeout(timer);
        remainingMs = Math.max(600, remainingMs - (Date.now() - startTime));
        isPaused = true;
      }

      function dismiss() {
        clearTimeout(timer);
        document.removeEventListener('click', onDocumentClick);
        wrapper.classList.remove('show');
        setTimeout(() => host.remove(), 220);
      }

      function onDocumentClick(e: MouseEvent) {
        if (dropdown.classList.contains('open')) {
          const path = e.composedPath();
          if (!path.includes(wrapper)) {
            dropdown.classList.remove('open');
            if (!isHovered) {
              startTimer();
            }
          }
        }
      }
      document.addEventListener('click', onDocumentClick);

      wrapper.addEventListener('mouseenter', () => {
        isHovered = true;
        pauseTimer();
      });

      wrapper.addEventListener('mouseleave', () => {
        isHovered = false;
        if (!dropdown.classList.contains('open')) {
          startTimer();
        }
      });

      const folderTrigger = shadow.getElementById('folder-trigger');
      folderTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !dropdown.classList.contains('open');
        if (willOpen) {
          pauseTimer();
          dropdown.classList.add('open');
        } else {
          dropdown.classList.remove('open');
          if (!isHovered) {
            startTimer();
          }
        }
      });

      const closeBtn = shadow.getElementById('close-btn');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });

      startTimer();
    }

    // Listen for background / sidepanel messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'SHOW_QUICK_FILING_CAPSULE') {
        showQuickFilingCapsule(
          message.itemId,
          message.folders || [],
          message.pageTitle,
          message.currentFolderId,
          message.currentFolderName,
          Boolean(message.isAnalyzing)
        );
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'SHOW_CAPTURE_FAILED') {
        showToast(getTranslation(currentLang, 'content.saveFailedToast'), 'error');
        sendResponse({ success: true });
        return true;
      }
    });
  },
});

