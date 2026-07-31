import React from 'react';
import { hourLabel, type ScheduleBand } from '../../build';
import { Card, CardBody, CardHeader } from '../run/Card';

const AXIS = ['00', '06', '12', '18', '24'];

/** The three scheduled devices over one day, against the hour the tank is on. */
export function SchedulesBand({ band }: { band: ScheduleBand }): React.JSX.Element {
  const cursor = `${(band.hour / 24) * 100}%`;

  return (
    <Card className="shrink-0">
      <CardHeader title="Schedules" meta={<span>24 h · now {hourLabel(band.hour)}</span>} />
      <CardBody className="py-2">
        {band.rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
            <span
              className={`w-[88px] shrink-0 text-[12px] ${
                row.active ? 'font-medium text-ink' : row.enabled ? 'text-ink-2' : 'text-ink-3'
              }`}
            >
              {row.label}
            </span>
            <span className="relative h-3 min-w-[120px] flex-1 rounded-badge bg-track">
              {row.spans.map((span) => (
                <span
                  key={span.from}
                  aria-hidden
                  className="absolute inset-y-0 rounded-badge bg-ink-3"
                  style={{ left: `${span.from * 100}%`, width: `${(span.to - span.from) * 100}%` }}
                />
              ))}
              <span
                aria-hidden
                className="absolute -top-1 bottom-[-4px] w-px bg-ink"
                style={{ left: cursor }}
              />
            </span>
            <span
              className={`w-full pt-1 text-right font-mono text-[11px] sm:w-[200px] sm:pt-0 ${
                row.enabled ? 'text-ink-2' : 'text-ink-3'
              }`}
            >
              {row.detail}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-x-3 pb-1">
          <span className="w-[88px] shrink-0" />
          <span className="flex min-w-[120px] flex-1 justify-between font-mono text-[10px] text-ink-3">
            {AXIS.map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
          </span>
          <span className="hidden w-[200px] sm:block" />
        </div>
      </CardBody>
    </Card>
  );
}
