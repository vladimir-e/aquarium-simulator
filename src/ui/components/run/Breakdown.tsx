import React from 'react';
import type { VitalityFactor } from '../../../simulation/index.js';

/** Below this the hourly change rounds to nothing worth printing. */
export const RATE_EPSILON = 0.05;

// For algae the sentiment inverts — a stressor is good news — but the signs stay
// as the engine sums them, so the rows still add up to net.
function tones(invert: boolean): { down: string; up: string } {
  return invert ? { down: 'text-ok', up: 'text-alert' } : { down: 'text-alert', up: 'text-ok' };
}

export function rateTone(rate: number, invert: boolean): string {
  const { down, up } = tones(invert);
  return rate < 0 ? down : up;
}

export function rateText(rate: number, digits = 2): string {
  return `${rate < 0 ? '−' : '+'}${Math.abs(rate).toFixed(digits)} %/h`;
}

/**
 * What is acting on one organism this hour, and what it sums to. Every fish,
 * plant and the algae answer "why is this one sick" in the same shape.
 */
export function Breakdown({
  stressors,
  benefits,
  net,
  invert = false,
}: {
  stressors: VitalityFactor[];
  benefits: VitalityFactor[];
  net: number;
  invert?: boolean;
}): React.JSX.Element {
  const { down, up } = tones(invert);

  return (
    <div className="pb-2 pl-6 pr-1 text-[12px]">
      {stressors.map((factor) => (
        <div key={`s-${factor.key}`} className={`flex min-h-[26px] items-center ${down}`}>
          <span>{factor.label}</span>
          <span className="ml-auto font-mono tabular-nums">−{factor.amount.toFixed(2)} %/h</span>
        </div>
      ))}
      {benefits.map((factor) => (
        <div key={`b-${factor.key}`} className={`flex min-h-[26px] items-center ${up}`}>
          <span>{factor.label}</span>
          <span className="ml-auto font-mono tabular-nums">+{factor.amount.toFixed(2)} %/h</span>
        </div>
      ))}
      <div className={`flex min-h-[26px] items-center font-medium ${rateTone(net, invert)}`}>
        <span>net</span>
        <span className="ml-auto font-mono tabular-nums">{rateText(net)}</span>
      </div>
    </div>
  );
}
