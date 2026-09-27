export interface ImageSplitParams {
  rows: number;
  columns: number;
  horizontalLines?: number[]; // [0, 1] 比例切线
  verticalLines?: number[];   // [0, 1] 比例切线
}

export interface ImageSplitPieceRect {
  row: number;
  column: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface SplitResultPiece {
  row: number;
  column: number;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * 根据切线比例或均匀划分计算绝对像素切割断点
 */
export function buildSplitCuts(
  lines: number[] | undefined,
  size: number,
  count: number
): number[] {
  if (!lines || lines.length === 0) {
    const cuts: number[] = [];
    for (let i = 0; i <= count; i++) {
      cuts.push(Math.round((i * size) / count));
    }
    return cuts;
  }
  const sorted = lines
    .map((l) => Math.round(l * size))
    .filter((p) => p > 0 && p < size)
    .sort((a, b) => a - b);
  return [0, ...sorted, size];
}

/**
 * 计算九宫格/多宫格切片区域矩形列表
 */
export function calculateSplitPieces(
  imageWidth: number,
  imageHeight: number,
  params: ImageSplitParams
): ImageSplitPieceRect[] {
  const xCuts = buildSplitCuts(
    params.verticalLines,
    imageWidth,
    Math.max(1, Math.floor(params.columns))
  );
  const yCuts = buildSplitCuts(
    params.horizontalLines,
    imageHeight,
    Math.max(1, Math.floor(params.rows))
  );

  const pieces: ImageSplitPieceRect[] = [];
  for (let row = 0; row < yCuts.length - 1; row++) {
    const sy = yCuts[row] ?? 0;
    const nextY = yCuts[row + 1] ?? sy;
    const sh = nextY - sy;
    for (let col = 0; col < xCuts.length - 1; col++) {
      const sx = xCuts[col] ?? 0;
      const nextX = xCuts[col + 1] ?? sx;
      const sw = nextX - sx;
      pieces.push({
        row,
        column: col,
        sx,
        sy,
        sw,
        sh,
      });
    }
  }
  return pieces;
}

/**
 * 纯前端 Canvas 切割图片，输出各个切片的 DataURL
 */
export async function splitImageDataUrl(
  dataUrl: string,
  params: ImageSplitParams
): Promise<SplitResultPiece[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const pieceRects = calculateSplitPieces(img.naturalWidth, img.naturalHeight, params);
        const results: SplitResultPiece[] = [];

        for (const rect of pieceRects) {
          if (rect.sw <= 0 || rect.sh <= 0) continue;
          const canvas = document.createElement('canvas');
          canvas.width = rect.sw;
          canvas.height = rect.sh;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(
            img,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            0,
            0,
            rect.sw,
            rect.sh
          );

          results.push({
            row: rect.row,
            column: rect.column,
            dataUrl: canvas.toDataURL('image/png'),
            width: rect.sw,
            height: rect.sh,
          });
        }
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for splitting'));
    };
    img.src = dataUrl;
  });
}

/**
 * 计算切片卡片平铺到画布上的世界物理坐标（防止相邻卡片重叠）
 */
export function calculateSplitPiecePlacement(
  sourcePos: { x: number; y: number },
  row: number,
  column: number,
  cardWidth = 320,
  cardHeight = 380,
  gapX = 30,
  gapY = 30
): { x: number; y: number } {
  const startX = sourcePos.x + cardWidth + gapX;
  const startY = sourcePos.y;
  return {
    x: startX + column * (cardWidth + gapX),
    y: startY + row * (cardHeight + gapY),
  };
}
