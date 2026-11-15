import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  collapsed?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'dark', collapsed = false, className = '' }) => {
  const isLightOnDark = variant === 'light';
  const strokeMain = isLightOnDark ? '#FFFFFF' : '#123C32';
  const accentGold = '#D6AE55';
  const accentSoft = isLightOnDark ? '#F0D99A' : '#185C46';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="38"
          height="38"
          rx="9"
          fill={isLightOnDark ? '#185C46' : '#123C32'}
        />
        <path
          d="M11 30V16.5L20 10.5L29 16.5V30H11Z"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M17 30V21.5H23V30"
          stroke={accentGold}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="29" cy="11.5" r="4.5" fill={accentGold} />
        <path
          d="M27.3 11.5H30.7M29 9.8V13.2"
          stroke="#123C32"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      {!collapsed && (
        <span className="font-display font-bold tracking-tight text-lg leading-none select-none">
          <span style={{ color: strokeMain }}>IMMOPAY</span>{' '}
          <span style={{ color: accentSoft === '#185C46' ? '#185C46' : '#F0D99A' }}>CI</span>
        </span>
      )}
    </span>
  );
};
