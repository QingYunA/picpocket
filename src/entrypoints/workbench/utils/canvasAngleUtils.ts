export interface CanvasImageAngleParams {
  horizontalAngle: number; // -60 ~ 60
  pitchAngle: number;      // -45 ~ 45
  cameraDistance: number;  // 1.0 ~ 10.0
  wideAngle: boolean;
}

export const DEFAULT_ANGLE_PARAMS: CanvasImageAngleParams = {
  horizontalAngle: 0,
  pitchAngle: 9,
  cameraDistance: 4.8,
  wideAngle: false,
};

/**
 * 依据相机参数构建 AI 视角提示词（支持中英文双语）
 */
export function buildAnglePrompt(params: CanvasImageAngleParams, lang: 'zh' | 'en' = 'zh'): string {
  const isZh = lang === 'zh';

  let horizontalDesc = '';
  if (params.horizontalAngle === 0) {
    horizontalDesc = isZh ? '正面视角' : 'front view';
  } else if (params.horizontalAngle > 0) {
    horizontalDesc = isZh
      ? `向右旋转 ${params.horizontalAngle} 度`
      : `rotated ${params.horizontalAngle} degrees right`;
  } else {
    horizontalDesc = isZh
      ? `向左旋转 ${Math.abs(params.horizontalAngle)} 度`
      : `rotated ${Math.abs(params.horizontalAngle)} degrees left`;
  }

  let pitchDesc = '';
  if (params.pitchAngle === 0) {
    pitchDesc = isZh ? '水平视角' : 'eye-level view';
  } else if (params.pitchAngle > 0) {
    pitchDesc = isZh
      ? `俯视 ${params.pitchAngle} 度`
      : `${params.pitchAngle}-degree top-down view`;
  } else {
    pitchDesc = isZh
      ? `仰视 ${Math.abs(params.pitchAngle)} 度`
      : `${Math.abs(params.pitchAngle)}-degree low-angle view`;
  }

  const lensDesc = params.wideAngle
    ? (isZh ? '广角镜头' : 'wide lens')
    : (isZh ? '标准镜头' : 'standard lens');

  const distStr = params.cameraDistance.toFixed(1);

  if (isZh) {
    const angleLabel = `AI 多角度：${horizontalDesc}，${pitchDesc}，镜头距离 ${distStr}，${lensDesc}`;
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${angleLabel}。`;
  } else {
    const angleLabel = `AI multi-angle: ${horizontalDesc}, ${pitchDesc}, camera distance ${distStr}, ${lensDesc}`;
    return `Regenerate a new view of the same subject from the reference image. Preserve the subject, colors, materials, and visual style; do not merely apply perspective distortion. ${angleLabel}.`;
  }
}

/**
 * 计算 3D 视差预览变换样式
 */
export function calculateAnglePreviewTransform(params: CanvasImageAngleParams): string {
  const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
  const clampedScale = Math.max(0.72, Math.min(1.08, scale));
  const rotateY = params.horizontalAngle * -0.45;
  const rotateX = params.pitchAngle * 0.35;
  return `perspective(520px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${clampedScale})`;
}
