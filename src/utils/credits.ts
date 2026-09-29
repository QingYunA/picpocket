/** 积分余额的紧凑写法，用于放不下完整数字的角标：999 以内原样，千位以上写成 1.1k / 12k */
export function formatCreditsCompact(balance: number): string {
  const rounded = Math.round(Number.isFinite(balance) ? Math.max(0, balance) : 0);
  if (rounded < 1000) return String(rounded);
  if (rounded < 10000) {
    const thousands = Math.round(rounded / 100) / 10;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return `${Math.round(rounded / 1000)}k`;
}
