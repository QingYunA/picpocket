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
    // 使用 Chrome 应用商店分配的公钥，本地开发版与商店版 ID 一致（bncoffcoihlpfbicajogmpcdckcfpnfa），OAuth 回调地址依赖它
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkAji4+SQwftuqQBTtb4wC01+NlKJqLQKdLcFWJicLRscXGugwGNtqBvWs+9g40Ll9+3dZtuB1V0j7gEbaLStiq56J1j21vFghvzi9bde+9hN8zJZry3LMo7GqQ9w8qfpH65JC15+FfpCwglWTY4jq6CgtIysn7uR9BjbxS9uIIDrex7wb7i7vaSOuWro9dwvVjYVHNN60p3jOH1pTFVfqwios1eph7zu8ySne8K8+k5NsDMSdhiJVtD3/1Fo/BkGx48PrMHMlo/JzI2X56UNr5ftB4y9kINQTrOmxzSEnMljn2zmN05ND52OHQaFHLjHd4Xz2621+h0oMnrfB3yh5QIDAQAB',
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
