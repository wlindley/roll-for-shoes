import type React from 'react';
import { useId } from 'react';

export function AppIcon(): React.JSX.Element {
  const id = useId();
  const bgId = `${id}-bg`;
  const shoeId = `${id}-shoe`;
  const dieId = `${id}-die`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={30} height={30} className="app-logo" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={bgId} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <linearGradient id={shoeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={dieId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="472" height="472" rx="112" fill={`url(#${bgId})`} />
      <ellipse cx="258" cy="408" rx="168" ry="8" fill="#020617" opacity="0.35" />
      <path d="M88 304c24-28 52-34 86-16 32 16 64 4 98-22l82 44c44 8 74 28 78 58H80c-4-24 0-46 8-64z" fill={`url(#${shoeId})`} stroke="#1d4ed8" strokeWidth="10" strokeLinejoin="round" />
      <path d="M160 356l64-48h34l-52 48z" fill="#f8fafc" />
      <path d="M306 297l11-13M329 309l11-13" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" />
      <rect x="76" y="364" width="364" height="44" rx="20" fill="#f8fafc" />
      <g transform="translate(274 178) rotate(16)">
        <rect x="-71" y="-64" width="148" height="148" rx="30" fill="#020617" opacity="0.28" />
        <rect x="-74" y="-74" width="148" height="148" rx="30" fill={`url(#${dieId})`} stroke="#ca8a04" strokeWidth="10" />
        <g fill="#713f12">
          <circle cx="-34" cy="-38" r="12" /><circle cx="34" cy="-38" r="12" />
          <circle cx="-34" cy="0" r="12" /><circle cx="34" cy="0" r="12" />
          <circle cx="-34" cy="38" r="12" /><circle cx="34" cy="38" r="12" />
        </g>
      </g>
    </svg>
  );
}
