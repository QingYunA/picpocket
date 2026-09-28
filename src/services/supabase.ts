import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

// 预设或环境变量配置（内置公开 Publishable Key，仅用于激活码核验与 Serverless AI 代理）
const defaultUrl = 'https://xyacwmkqoizuxlqtywoa.supabase.co';
const defaultAnonKey = 'sb_publishable_Q8OOtQc6fp_4MBD3FQTkOQ_K1DwPcN7';

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
    defaultUrl;

  const envKey =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
    defaultAnonKey;

  return {
    url: envUrl || defaultUrl,
    anonKey: envKey || defaultAnonKey,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url) && Boolean(anonKey) && !anonKey.includes('placeholder');
}

const config = getSupabaseConfig();

/** 登录会话在 chrome.storage.local 中的键名（各扩展页面共享，用于跨页面同步登录状态） */
export const AUTH_STORAGE_KEY = 'picpocket-auth';

/**
 * PicPocket Supabase 客户端全局单例：账号登录（PKCE）、兑换码核验与托管服务调用。
 * 会话持久化在 chrome.storage.local，侧边栏、工作台、设置页与后台共享同一登录状态。
 */
export const supabase: SupabaseClient = createClient(config.url, config.anonKey, {
  auth: {
    storage: authStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
