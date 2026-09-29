import { useSyncExternalStore } from 'react';
import { getHostedCatalog, subscribeHostedCatalog, type HostedCatalog } from '../config/hostedModels';

/** 服务端当前启用的托管模型目录；登录后拉到新目录时相关界面会随之刷新 */
export function useHostedCatalog(): HostedCatalog {
  return useSyncExternalStore(subscribeHostedCatalog, getHostedCatalog);
}
