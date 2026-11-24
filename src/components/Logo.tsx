import React, { useEffect, useState } from 'react';
import { DEFAULT_LOGO_URL } from '../data/seed';

interface LogoProps {
  size?: 'sm' | 'md';
  logoUrl?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', logoUrl }) => {
  const iconBox = size === 'sm' ? 'w-9 h-9' : 'w-12 h-12';
  const textClass = size === 'sm' ? 'text-lg' : 'text-xl';
  const resolvedSrc = logoUrl?.trim() || DEFAULT_LOGO_URL;
  const isDefaultBadge = resolvedSrc === DEFAULT_LOGO_URL;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSrc]);

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <span
        className={`${iconBox} rounded-full overflow-hidden bg-[#143624] shrink-0 flex items-center justify-center ring-1 ring-[#143624]/15`}
        aria-hidden="true"
      >
        {imgFailed ? (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none">
            <rect width="64" height="64" fill="#143624" />
            <path
              d="M32 14c-7.5 4.4-12 12-12 20.6 0 7.2 5.4 13 12 13s12-5.8 12-13C44 26 39.5 18.4 32 14Z"
              fill="#1F6E43"
            />
            <path
              d="M32 21v23M32 30l6-4.2M32 36l-5.8-4"
              stroke="#FAFBF8"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="43" cy="21" r="3.8" fill="#D95D1A" />
          </svg>
        ) : (
          <img
            src={resolvedSrc}
            alt="Logo Hortimarket"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-cover ${isDefaultBadge ? 'scale-[1.04]' : ''}`}
          />
        )}
      </span>
      <span className={`font-display font-bold tracking-tight text-[#143624] ${textClass}`}>
        Hortimarket
      </span>
    </span>
  );
};
