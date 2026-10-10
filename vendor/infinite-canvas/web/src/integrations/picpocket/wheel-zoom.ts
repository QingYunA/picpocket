/**
 * 一次滚轮事件对应的缩放倍率（>1 放大）。
 * 鼠标滚轮每格 deltaY≈100，沿用 1.1^(Δ/100)，一格约 10%；
 * 触控板捏合在浏览器里是 ctrlKey 的 wheel 事件，每个事件 deltaY 通常只有 1~10，
 * 按滚轮的公式一次完整捏合也只能缩放十几个百分点，所以改用指数公式并限制单次幅度。
 */
export function wheelZoomFactor(deltaY: number, pinch: boolean): number {
    if (!pinch) return Math.pow(1.1, -deltaY / 100);
    return Math.exp(-Math.max(-40, Math.min(40, deltaY)) * 0.01);
}
