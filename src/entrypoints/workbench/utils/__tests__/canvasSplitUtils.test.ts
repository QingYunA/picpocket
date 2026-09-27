import { describe, it, expect } from 'vitest';
import {
  buildSplitCuts,
  calculateSplitPieces,
  calculateSplitPiecePlacement,
  type ImageSplitParams,
} from '../canvasSplitUtils';

describe('canvasSplitUtils', () => {
  it('should build uniform split cuts when no custom lines are provided', () => {
    // 1000px 切成 2 份 -> [0, 500, 1000]
    const cuts2 = buildSplitCuts(undefined, 1000, 2);
    expect(cuts2).toEqual([0, 500, 1000]);

    // 1200px 切成 3 份 -> [0, 400, 800, 1200]
    const cuts3 = buildSplitCuts(undefined, 1200, 3);
    expect(cuts3).toEqual([0, 400, 800, 1200]);
  });

  it('should build custom split cuts when percentage lines are provided', () => {
    // 1000px, 切线在 0.3 和 0.7 处
    const cuts = buildSplitCuts([0.3, 0.7], 1000, 3);
    expect(cuts).toEqual([0, 300, 700, 1000]);
  });

  it('should calculate correct 2x2 grid split piece rectangles', () => {
    const params: ImageSplitParams = {
      rows: 2,
      columns: 2,
    };
    const pieces = calculateSplitPieces(1000, 800, params);
    expect(pieces.length).toBe(4);

    // [0,0] Top-Left
    expect(pieces[0]).toEqual({
      row: 0,
      column: 0,
      sx: 0,
      sy: 0,
      sw: 500,
      sh: 400,
    });

    // [0,1] Top-Right
    expect(pieces[1]).toEqual({
      row: 0,
      column: 1,
      sx: 500,
      sy: 0,
      sw: 500,
      sh: 400,
    });

    // [1,0] Bottom-Left
    expect(pieces[2]).toEqual({
      row: 1,
      column: 0,
      sx: 0,
      sy: 400,
      sw: 500,
      sh: 400,
    });

    // [1,1] Bottom-Right
    expect(pieces[3]).toEqual({
      row: 1,
      column: 1,
      sx: 500,
      sy: 400,
      sw: 500,
      sh: 400,
    });
  });

  it('should calculate correct 3x3 grid split pieces count', () => {
    const params: ImageSplitParams = {
      rows: 3,
      columns: 3,
    };
    const pieces = calculateSplitPieces(900, 900, params);
    expect(pieces.length).toBe(9);
    expect(pieces[0]!.sw).toBe(300);
    expect(pieces[0]!.sh).toBe(300);
    expect(pieces[8]!.sx).toBe(600);
    expect(pieces[8]!.sy).toBe(600);
  });

  it('should calculate non-overlapping placement for split pieces', () => {
    const sourcePos = { x: 100, y: 100 };
    // [0, 0] 第一块切片放在源卡片右侧
    const pos00 = calculateSplitPiecePlacement(sourcePos, 0, 0, 320, 380, 30, 30);
    expect(pos00).toEqual({ x: 450, y: 100 }); // 100 + 320 + 30 = 450

    // [0, 1] 第一行第二列，横向步进 350
    const pos01 = calculateSplitPiecePlacement(sourcePos, 0, 1, 320, 380, 30, 30);
    expect(pos01).toEqual({ x: 800, y: 100 }); // 450 + 350 = 800

    // [1, 0] 第二行第一列，纵向步进 410
    const pos10 = calculateSplitPiecePlacement(sourcePos, 1, 0, 320, 380, 30, 30);
    expect(pos10).toEqual({ x: 450, y: 510 }); // 100 + 410 = 510
  });
});
