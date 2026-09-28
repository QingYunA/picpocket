import React, { useEffect, useState } from 'react';
import type { AccountUser } from '@/services/auth';

interface AccountAvatarProps {
  user: AccountUser;
  /** Tailwind 尺寸类，例如 'h-6 w-6' */
  sizeClass: string;
  textClass: string;
}

/** 账号头像：第三方头像加载失败时回退为首字母圆标 */
export const AccountAvatar: React.FC<AccountAvatarProps> = ({ user, sizeClass, textClass }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [user.avatarUrl]);

  if (user.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-full bg-amber-100 font-semibold text-amber-800`}>
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
};
