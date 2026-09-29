(function () {
  // 只把 ID Token 交给官方扩展，防止其他扩展冒用本页获取用户的 Google 身份
  var ALLOWED_EXTENSION_IDS = ['bncoffcoihlpfbicajogmpcdckcfpnfa'];
  var GOOGLE_CLIENT_ID = '784664835321-l4if49r18oc4ed0ibe857p5lrbqfdcb2.apps.googleusercontent.com';
  var MESSAGE_TYPE = 'picpocket:google-id-token';

  var params = new URLSearchParams(location.search);
  var lang = params.get('lang');
  var zh = lang ? lang === 'zh' : (navigator.language || '').toLowerCase().indexOf('zh') === 0;
  var TEXT = zh
    ? {
        title: '登录 PicPocket',
        subtitle: '使用 Google 账号继续，完成后会自动回到扩展。',
        invalid: '登录链接无效，请回到 PicPocket 扩展重新点击「使用 Google 登录」。',
        noExtension: '请在已安装 PicPocket 扩展的 Chrome 浏览器中打开此页面。',
        sending: '正在完成登录…',
        success: '登录成功，可以关闭此页面。',
        failed: '登录失败，请回到扩展重试。',
        scriptFailed: 'Google 登录组件加载失败，请检查网络后刷新页面。'
      }
    : {
        title: 'Sign in to PicPocket',
        subtitle: 'Continue with your Google account. You will return to the extension automatically.',
        invalid: 'This sign-in link is invalid. Go back to the PicPocket extension and click "Continue with Google" again.',
        noExtension: 'Open this page in Chrome with the PicPocket extension installed.',
        sending: 'Finishing sign-in…',
        success: 'Signed in. You can close this page.',
        failed: 'Sign-in failed. Go back to the extension and try again.',
        scriptFailed: 'Could not load Google sign-in. Check your connection and reload the page.'
      };

  document.documentElement.lang = zh ? 'zh' : 'en';
  document.title = TEXT.title + ' — PicPocket';
  Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
    el.textContent = TEXT[el.getAttribute('data-i18n')];
  });

  // 访问统计（Umami，无 Cookie）；页面 URL 里的 nonce 等查询参数不会被上报（data-exclude-search）
  function track(name) {
    if (window.umami && window.umami.track) window.umami.track(name);
  }

  var statusEl = document.getElementById('status');
  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = kind || '';
  }

  var nonce = params.get('nonce') || '';
  var extensionId = params.get('ext') || '';
  if (!/^[0-9a-f]{64}$/.test(nonce) || ALLOWED_EXTENSION_IDS.indexOf(extensionId) === -1) {
    track('signin_invalid_link');
    setStatus(TEXT.invalid, 'error');
    return;
  }
  if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    track('signin_no_extension');
    setStatus(TEXT.noExtension, 'error');
    return;
  }

  function handleCredential(response) {
    setStatus(TEXT.sending);
    chrome.runtime.sendMessage(extensionId, { type: MESSAGE_TYPE, idToken: response.credential }, function (reply) {
      if (chrome.runtime.lastError || !reply) return setStatus(TEXT.noExtension, 'error');
      track(reply.ok ? 'signin_google_success' : 'signin_google_failed');
      setStatus(reply.ok ? TEXT.success : TEXT.failed, reply.ok ? 'success' : 'error');
    });
  }

  var script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onerror = function () { track('signin_google_script_failed'); setStatus(TEXT.scriptFailed, 'error'); };
  script.onload = function () {
    track('signin_page_ready');
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: nonce,
      callback: handleCredential,
      auto_select: false,
      context: 'signin'
    });
    google.accounts.id.renderButton(document.getElementById('google-button'), {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: zh ? 'zh_CN' : 'en'
    });
  };
  document.head.appendChild(script);
})();
