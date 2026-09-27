import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * PicPocket 官方品牌 Logo：全产品唯一主标（与 Chrome 工具栏图标、官网落地页同源位图）。
 * 不再维护独立的手绘矢量变体，避免各界面出现多套风格。
 */
/** 显示尺寸不超过该值时 48px 位图已足够 2x 屏清晰度，更大尺寸改用 128px */
const SMALL_LOGO_MAX_SIZE = 24;

export const Logo: React.FC<LogoProps> = ({ size = 24, className = '' }) => {
  const src = size > SMALL_LOGO_MAX_SIZE ? '/icons/icon-128.png' : '/icons/icon-48.png';
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="PicPocket"
      draggable={false}
      className={`shrink-0 select-none rounded-[22%] ${className}`}
    />
  );
};

export default Logo;
