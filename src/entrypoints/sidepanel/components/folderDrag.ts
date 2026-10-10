/**
 * 解析拖到文件夹上的 text/plain 载荷：单张素材为 "42"，多选拖拽为 "[1,2,3]"。
 * 只接受正整数 ID；外部网页拖进来的任意文本一律返回空数组，避免误移动素材。
 */
export function parseDraggedItemIds(payload: string): number[] {
  const text = payload.trim();
  if (/^\d+$/.test(text)) {
    const id = Number(text);
    return id > 0 ? [id] : [];
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => Number.isInteger(v) && v > 0)) {
        return parsed as number[];
      }
    } catch {
      // 非法 JSON 视为无效载荷
    }
  }
  return [];
}
