import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: '1.0.1',
    // 固定扩展 ID（lnmihmfcdidmggghgnkfghbpeaekdlea），OAuth 回调地址依赖它；对应私钥不在仓库中
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtMs4XrVLW8dLj1zVKtfXQdEdGg1ld1IGKoiMvGFtWsXGHC/CBJZfzD33yUevLD2EO0zha7fY5ThMjSU0qv3e/o4agiiJ46j1emXo0/+RF2EHAgfQOXaO7Nns6J6+5CPxXWQdDkdCCgbTf/XKtTHcgv1X1siR740JyDuvURU2IQZFVv2ED6+SQskb1Gf/nJAhpiR6Lq27X/OGBdxFwHHZBIQ52OosAcSO1ahxEl2Umlt/QV5fDds8A3N0ox4g/54vB4sHUd/Yz5zWMSjdXr9snVTsvpW3NtDNoi3AdNHS+mthVV/ar6TVgmvF6dOfQGoGgHJ7M1/nXCPEZE14uRiW2wIDAQAB',
    permissions: [
      'identity',
      'sidePanel',
      'storage',
      'activeTab',
      'contextMenus',
      'unlimitedStorage',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
