import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ANGLE_PARAMS,
  buildAnglePrompt,
  calculateAnglePreviewTransform,
  type CanvasImageAngleParams,
} from '../canvasAngleUtils';

describe('canvasAngleUtils', () => {
  it('should provide reasonable default angle parameters', () => {
    expect(DEFAULT_ANGLE_PARAMS.horizontalAngle).toBe(0);
    expect(DEFAULT_ANGLE_PARAMS.pitchAngle).toBe(9);
    expect(DEFAULT_ANGLE_PARAMS.cameraDistance).toBe(4.8);
    expect(DEFAULT_ANGLE_PARAMS.wideAngle).toBe(false);
  });

  it('should compute valid 3D perspective transform string', () => {
    const css = calculateAnglePreviewTransform({
      horizontalAngle: 20,
      pitchAngle: -15,
      cameraDistance: 5.0,
      wideAngle: true,
    });
    expect(css).toContain('perspective(520px)');
    expect(css).toContain('rotateY(-9deg)'); // 20 * -0.45 = -9
    expect(css).toContain('rotateX(-5.25deg)'); // -15 * 0.35 = -5.25
    expect(css).toContain('scale(');
  });

  it('should build natural Chinese angle prompt with right rotation and top-down view', () => {
    const params: CanvasImageAngleParams = {
      horizontalAngle: 30,
      pitchAngle: 20,
      cameraDistance: 4.5,
      wideAngle: false,
    };
    const prompt = buildAnglePrompt(params, 'zh');
    expect(prompt).toContain('向右旋转 30 度');
    expect(prompt).toContain('俯视 20 度');
    expect(prompt).toContain('镜头距离 4.5');
    expect(prompt).toContain('标准镜头');
    expect(prompt).toContain('保持主体、颜色、材质和画面风格一致');
  });

  it('should build natural English angle prompt with left rotation and low-angle view', () => {
    const params: CanvasImageAngleParams = {
      horizontalAngle: -25,
      pitchAngle: -10,
      cameraDistance: 6.0,
      wideAngle: true,
    };
    const prompt = buildAnglePrompt(params, 'en');
    expect(prompt).toContain('rotated 25 degrees left');
    expect(prompt).toContain('10-degree low-angle view');
    expect(prompt).toContain('camera distance 6.0');
    expect(prompt).toContain('wide lens');
    expect(prompt).toContain('Preserve the subject, colors, materials, and visual style');
  });

  it('should handle zero degree front and level view properly', () => {
    const params: CanvasImageAngleParams = {
      horizontalAngle: 0,
      pitchAngle: 0,
      cameraDistance: 5.0,
      wideAngle: false,
    };
    const promptZh = buildAnglePrompt(params, 'zh');
    expect(promptZh).toContain('正面视角');
    expect(promptZh).toContain('水平视角');

    const promptEn = buildAnglePrompt(params, 'en');
    expect(promptEn).toContain('front view');
    expect(promptEn).toContain('eye-level view');
  });
});
