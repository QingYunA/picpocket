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
    version: '1.0.0',
    permissions: [
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
