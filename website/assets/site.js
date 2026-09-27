/* PicPocket website · shared behaviour (theme, language, header, toast).
   The initial theme/language is applied by an inline <head> snippet to avoid a flash. */
(function () {
  var LANG_KEY = 'picpocket_site_lang';
  var THEME_KEY = 'picpocket_site_theme';
  var root = document.documentElement;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function syncLangLabels() {
    var zh = root.getAttribute('lang') === 'zh';
    document.querySelectorAll('[data-lang-label]').forEach(function (el) {
      el.textContent = zh ? 'EN' : '中文';
    });
    document.querySelectorAll('[data-lang-toggle]').forEach(function (el) {
      el.setAttribute('aria-label', zh ? 'Switch to English' : '切换到中文');
    });
    var title = document.querySelector('meta[name="title-' + (zh ? 'zh' : 'en') + '"]');
    if (title) document.title = title.getAttribute('content');
  }

  document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('lang') === 'zh' ? 'en' : 'zh';
      root.setAttribute('lang', next);
      store(LANG_KEY, next);
      syncLangLabels();
    });
  });

  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store(THEME_KEY, next);
    });
  });

  syncLangLabels();

  // Header hairline once the page scrolls
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Reveal-on-scroll
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Toast helper
  var toastTimer;
  window.ppToast = function (message) {
    var el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  };

  window.ppLang = function () { return root.getAttribute('lang') === 'zh' ? 'zh' : 'en'; };
})();
