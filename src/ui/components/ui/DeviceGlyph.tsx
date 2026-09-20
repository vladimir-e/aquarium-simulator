import React from 'react';
import type { DeviceId } from '../../build';

/**
 * One 16 px monoline silhouette per device, drawn in the same 16-unit square on
 * the same 1.2 stroke as the species glyphs — so a rack row and a roster row
 * weigh the same, and a device says what it is before its name is read.
 */
const PATHS: Record<DeviceId, React.ReactNode> = {
  filter: (
    <>
      <rect x="8.8" y="5" width="5.4" height="9" rx="1.2" />
      <path d="M11.5 5V3.4H4.4A2.6 2.6 0 0 0 1.8 6v7" />
      <path d="M8.8 8.4h5.4M8.8 11h5.4" />
    </>
  ),
  heater: (
    <>
      <rect x="6" y="1.8" width="4" height="12.4" rx="2" />
      <path d="M7.2 4.8h1.6M7.2 6.8h1.6M7.2 8.8h1.6M7.2 10.8h1.6" />
    </>
  ),
  light: (
    <>
      <rect x="2.2" y="2.4" width="11.6" height="3.2" rx="1" />
      <path d="M4.8 8v2.2M8 8v3.8M11.2 8v2.2" />
    </>
  ),
  airPump: (
    <>
      <rect x="2" y="11.4" width="4.8" height="2.6" rx="1.1" />
      <circle cx="8.4" cy="9.4" r="1.1" />
      <circle cx="11" cy="6.4" r="1.5" />
      <circle cx="8.6" cy="3.4" r="1" />
    </>
  ),
  ato: (
    <>
      <path d="M8 1.6c1.6 2 2.4 3.3 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-.9.8-2.2 2.4-4.2z" />
      <path d="M1.8 10.6h12.4" />
      <path d="M4.2 13.6h7.6" />
    </>
  ),
  co2Generator: (
    <>
      <rect x="5.2" y="1.8" width="5.6" height="12.4" rx="2.6" />
      <circle cx="8" cy="10.6" r="1.1" />
      <circle cx="8" cy="7.2" r="1.1" />
      <circle cx="8" cy="4.2" r="1.1" />
    </>
  ),
  powerhead: (
    <>
      <circle cx="6.4" cy="8" r="3.9" />
      <path d="M6.4 8V4.3M6.4 8l3.2 1.9M6.4 8 3.2 9.9" />
      <path d="M11.4 8h3.2M13 6.6 14.6 8 13 9.4" />
    </>
  ),
  autoDoser: (
    <>
      <path d="M6.4 1.8h3.2v2.4l1.7 2.4v5.9a1.5 1.5 0 0 1-1.5 1.5H6.2a1.5 1.5 0 0 1-1.5-1.5V6.6l1.7-2.4z" />
      <path d="M4.7 9.6h6.6" />
    </>
  ),
};

export function DeviceGlyph({
  device,
  className = '',
  size = 'h-4 w-4',
  tone = 'text-ink-2',
}: {
  device: DeviceId;
  className?: string;
  /** Replaces the default box rather than racing it in the stylesheet. */
  size?: string;
  tone?: string;
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`shrink-0 ${size} ${tone} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[device]}
    </svg>
  );
}
