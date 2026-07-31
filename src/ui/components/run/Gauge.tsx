import React from 'react';
import type { Status, WaterGauge } from '../../run';
import { Pill, Sparkline, statusText } from './elements';

const FILL: Record<Status, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alert: 'bg-alert',
  neutral: 'bg-ink-3',
};

const OUTLINE: Record<Status, string> = {
  ok: '',
  warn: 'ring-1 ring-warn',
  alert: 'ring-1 ring-alert',
  neutral: '',
};

/** Travel measured in the wireframe: 240 px keeps Bacteria and Waste whole beneath. */
const TRACK = 'h-40 lg:h-60';

const pct = (n: number): string => `${n * 100}%`;

function tone(status: Status, quiet: string): string {
  return status === 'alert' || status === 'warn' ? statusText(status) : quiet;
}

/**
 * One vertical instrument: labelled axis, the span the engine does not alert on,
 * threshold hairlines, a dashed line where the value is being driven, the live
 * value, its last 24 h, and what the numbers mean.
 */
export function Gauge({ gauge }: { gauge: WaterGauge }): React.JSX.Element {
  const { status } = gauge;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-h-[18px] items-center justify-center gap-1.5">
        <span
          className={`text-[12px] font-bold uppercase tracking-[0.06em] ${tone(status, 'text-ink-2')}`}
        >
          {gauge.name}
        </span>
        {gauge.pill === 'HIGH' && <Pill variant="alert">HIGH</Pill>}
        {gauge.pill === 'LOW' && <Pill variant="warn">LOW</Pill>}
      </div>

      <div className="flex justify-center gap-1.5">
        <div className={`relative hidden w-8 shrink-0 lg:block ${TRACK}`} aria-hidden>
          {gauge.ticks.map((tick) => (
            <span
              key={`${tick.label}@${tick.at}`}
              style={{ bottom: pct(tick.at) }}
              className="absolute right-0 translate-y-1/2 font-mono text-[9.5px] leading-none text-ink-3"
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          aria-hidden
          className={`relative w-9 shrink-0 rounded-[5px] bg-track ${TRACK} ${OUTLINE[status]}`}
        >
          {gauge.band && (
            <span
              className="absolute inset-x-0 bg-ok/15"
              style={{ bottom: pct(gauge.band.from), height: pct(gauge.band.to - gauge.band.from) }}
            />
          )}
          {gauge.limits.map((at) => (
            <span key={at} className="absolute -inset-x-1 h-px bg-hairline-2" style={{ bottom: pct(at) }} />
          ))}
          {gauge.setpoint && (
            <span
              className="absolute -inset-x-1 border-t border-dashed border-accent"
              style={{ bottom: pct(gauge.setpoint.at) }}
            />
          )}
          <span
            className={`absolute inset-x-0 bottom-0 rounded-b-[5px] ${FILL[status]}`}
            style={{ height: pct(gauge.fill) }}
          />
        </div>
      </div>

      <div
        className={`text-center font-mono text-[21px] font-semibold leading-none tabular-nums ${tone(status, 'text-ink')}`}
      >
        {gauge.text}
        {gauge.unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{gauge.unit}</span>}
      </div>

      <div className={`h-[22px] ${statusText(status)}`}>
        <Sparkline values={gauge.trace} />
      </div>

      <div className={`text-center font-mono text-[10px] leading-[1.4] ${tone(status, 'text-ink-3')}`}>
        {gauge.caption}
      </div>
    </div>
  );
}

/** Three gauges under one heading — Water, or the nitrogen cycle. */
export function GaugeGroup({
  title,
  gauges,
}: {
  title: string;
  gauges: WaterGauge[];
}): React.JSX.Element {
  return (
    <section className="flex flex-1 flex-col rounded-card border border-hairline bg-surface-2 px-2 py-2.5">
      <h2 className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.09em] text-ink-3">
        {title}
      </h2>
      <div className="flex gap-1">
        {gauges.map((gauge) => (
          <Gauge key={gauge.key} gauge={gauge} />
        ))}
      </div>
    </section>
  );
}
