import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/**
 * PicPocket Supabase 客户端全局单例（仅用于激活码查询与 Serverless AI 代理）
 */
export const supabase: SupabaseClient = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
