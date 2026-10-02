export type MemeSourceKind = 'memegen' | 'custom';

export interface MemeSource {
  id: string;
  name: string;
  kind: MemeSourceKind;
  /** 索引地址（memegen 为 templates 接口，custom 为用户的 JSON 索引） */
  url: string;
  homepage: string;
  enabled: boolean;
  builtIn: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  count?: number;
}

export interface MemeItem {
  id: string;
  sourceId: string;
  name: string;
  /** 远程图片地址，只存地址不存图片 */
  url: string;
  category?: string;
  tags: string[];
  isFavorite?: boolean;
  /** 已存入图库时对应的 InspirationItem id，避免重复入库 */
  savedItemId?: number;
  createdAt: number;
}

export interface MemeSourceRefreshResult {
  sourceId: string;
  sourceName: string;
  count: number;
  success: boolean;
  lastError: string;
}
