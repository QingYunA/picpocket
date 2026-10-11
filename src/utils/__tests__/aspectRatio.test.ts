import { describe, expect, it } from 'vitest';
import { ASPECT_RATIO_CONFIGS } from '../../services/imageGenerator';
import { ASPECT_RATIO_LIST, formatRatioDimensions, resolveAspectRatio } from '../aspectRatio';

describe('resolveAspectRatio', () => {
  it('已保存的草稿画幅优先于设置里的默认画幅', () => {
    expect(resolveAspectRatio('9:16', '16:9')).toBe('9:16');
  });

  it('草稿里显式保存的 1:1 同样优先（不能被默认值覆盖）', () => {
    expect(resolveAspectRatio('1:1', '16:9')).toBe('1:1');
  });

  it('没有草稿画幅时使用设置里的默认画幅', () => {
    expect(resolveAspectRatio(undefined, '21:9')).toBe('21:9');
  });

  it('草稿与设置都没有时回退 1:1', () => {
    expect(resolveAspectRatio(undefined, undefined)).toBe('1:1');
  });

  it('草稿里的无效值视为未保存，回退到默认画幅', () => {
    expect(resolveAspectRatio('5:7' as never, '4:3')).toBe('4:3');
  });

  it('设置里的无效值回退 1:1', () => {
    expect(resolveAspectRatio(undefined, '7:5' as never)).toBe('1:1');
  });
});

describe('ASPECT_RATIO_LIST / formatRatioDimensions', () => {
  it('设置卡片的画幅列表与 ASPECT_RATIO_CONFIGS 完全一致', () => {
    expect([...ASPECT_RATIO_LIST].sort()).toEqual(Object.keys(ASPECT_RATIO_CONFIGS).sort());
  });

  it('像素标签由 ASPECT_RATIO_CONFIGS 推导', () => {
    expect(formatRatioDimensions('16:9')).toBe('1792×1024');
    expect(formatRatioDimensions('21:9')).toBe('1792×768');
    expect(formatRatioDimensions('2:3')).toBe('768×1152');
  });
});
