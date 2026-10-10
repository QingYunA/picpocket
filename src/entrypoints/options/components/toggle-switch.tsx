import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 无可见文字时屏幕阅读器读到的名称 */
  label: string;
  size?: 'md' | 'sm';
  tone?: 'zinc' | 'emerald';
}

const TRACK_SIZE = {
  md: "h-5 w-10 after:h-4 after:w-4",
  sm: "h-4 w-8 after:h-3 after:w-3",
} as const;

const CHECKED_TONE = {
  zinc: 'peer-checked:bg-zinc-900',
  emerald: 'peer-checked:bg-emerald-600',
} as const;

/** 设置页统一的开关：原生 checkbox 保留键盘与读屏语义，滑块只负责外观 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, size = 'md', tone = 'zinc' }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <div
      className={`${TRACK_SIZE[size]} ${CHECKED_TONE[tone]} rounded-full bg-zinc-200 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900/40 peer-focus-visible:ring-offset-2 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:rounded-full after:border after:border-zinc-300 after:bg-white after:transition-all after:content-['']`}
    />
  </label>
);
