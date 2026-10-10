import { describe, it, expect } from 'vitest';
import { parseDraggedItemIds } from '../folderDrag';

describe('parseDraggedItemIds', () => {
  it('解析单个素材 ID', () => {
    expect(parseDraggedItemIds('42')).toEqual([42]);
  });

  it('解析多选拖拽的 JSON 数组', () => {
    expect(parseDraggedItemIds('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('拒绝从网页拖进来的普通文本，避免误把 "42 apples" 当成素材 42', () => {
    expect(parseDraggedItemIds('42 apples')).toEqual([]);
    expect(parseDraggedItemIds('hello')).toEqual([]);
    expect(parseDraggedItemIds('')).toEqual([]);
  });

  it('拒绝包含非正整数的数组', () => {
    expect(parseDraggedItemIds('[1,"2"]')).toEqual([]);
    expect(parseDraggedItemIds('[1,-2]')).toEqual([]);
    expect(parseDraggedItemIds('[1,2.5]')).toEqual([]);
    expect(parseDraggedItemIds('[]')).toEqual([]);
  });

  it('拒绝损坏的 JSON', () => {
    expect(parseDraggedItemIds('[1,2')).toEqual([]);
    expect(parseDraggedItemIds('[1,2]]')).toEqual([]);
  });
});
