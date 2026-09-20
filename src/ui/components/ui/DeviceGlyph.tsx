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
      <rect x="7.6" y="5.4" width="6.6" height="8.4" rx="1.2" />
      <path d="M10.9 5.4V3.6H4.6A2.8 2.8 0 0 0 1.8 6.4v5.6" />
      <path d="M0.8 12h2M7.6 9.6h6.6" />
    </>
  ),
  heater: (
    <>
      <rect x="5.8" y="1.6" width="4.4" height="12.8" rx="2.2" />
      <path d="M7 5.4h2.2M7 7.6h2.2M7 9.8h2.2" />
    </>
  ),
  light: (
    <>
      <rect x="2.2" y="2.2" width="11.6" height="3.2" rx="1" />
      <path d="M4.8 7.8v2.6M8 7.8v4.2M11.2 7.8v2.6" />
    </>
  ),
  airPump: (
    <>
      <rect x="1.4" y="11" width="5.8" height="3" rx="1.3" />
      <circle cx="9.4" cy="9.2" r="1.6" />
      <circle cx="12.6" cy="5.6" r="2" />
      <circle cx="9.2" cy="2.6" r="1.3" />
    </>
  ),
  ato: (
    <>
      <path d="M8 1.4c1.9 2.4 2.9 4 2.9 5.1a2.9 2.9 0 0 1-5.8 0c0-1.1 1-2.7 2.9-5.1z" />
      <path d="M1.8 11.4h12.4" />
      <path d="M4.2 14h7.6" />
    </>
  ),
  co2Generator: (
    <>
      <rect x="4.8" y="4.6" width="6.4" height="9.4" rx="2.2" />
      <path d="M8 4.6V2.2" />
      <path d="M6.4 2.2h3.2" />
    </>
  ),
  powerhead: (
    <>
      <circle cx="6.2" cy="8" r="4.2" />
      <path d="M6.2 8V4.6M6.2 8l3 1.8M6.2 8 3.2 9.8" />
      <path d="M11.6 8h2.8M12.9 6.7 14.4 8l-1.5 1.3" />
    </>
  ),
  autoDoser: (
    <>
      <path d="M6.2 1.8h3.6v2.4l1.8 2.5v5.8a1.5 1.5 0 0 1-1.5 1.5H5.9a1.5 1.5 0 0 1-1.5-1.5V6.7l1.8-2.5z" />
      <path d="M4.4 9.8h7.2" />
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
