/**
 * 将 Blob/File 二进制数据转换为 Base64 DataURL
 */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 抓取到的内容是否可能是图片。
 * 防盗链的 CDN 常以 200 + text/html / json 返回拦截页，把它当图片入库只会得到一张打不开的素材；
 * 部分 CDN 对正常图片返回 application/octet-stream 或不带类型，需要放行。
 */
export function isLikelyImageBlob(blob: Blob): boolean {
  if (blob.size === 0) return false;
  const type = blob.type.toLowerCase();
  return type === '' || type.startsWith('image/') || type === 'application/octet-stream' || type === 'binary/octet-stream';
}
