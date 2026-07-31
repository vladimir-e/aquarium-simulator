import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import { wasteSummary, type WasteReadout, type WasteSourceKey } from '../../run';
import { Card, CardBody, CardFooter, CardHeader } from './Card';
import { DataRow, FieldLabel } from './elements';

/** A monotone ramp in source order — these are shares of one pool, not statuses. */
const TONE: Record<WasteSourceKey, string> = {
  food: 'bg-ink',
  fish: 'bg-ink-2',
  plants: 'bg-ink-3',
  ambient: 'bg-hairline-2',
};

export function WasteCard({
  readout,
  config,
}: {
  readout: WasteReadout;
  config: TunableConfig;
}): React.JSX.Element {
  const leading = readout.sources
    .filter((source) => source.share > 0.005)
    .sort((a, b) => b.share - a.share)
    .slice(0, 2)
    .map((source) => `${Math.round(source.share * 100)} % ${source.label.toLowerCase()}`);

  return (
    <Card className="min-h-0">
      <CardHeader title="Waste" meta={`${readout.standing.toFixed(2)} g standing`} />
      <CardBody className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <FieldLabel>Standing</FieldLabel>
          <div className="mt-1.5 font-mono text-[30px] font-semibold leading-none tabular-nums">
            {readout.standing.toFixed(2)}
            <span className="text-[13px] font-normal text-ink-3"> g</span>
          </div>
          <div className="mt-1.5 text-[11px] text-ink-3">
            producing <span className="font-mono text-ink-2">{readout.perHour.toFixed(3)} g/h</span>{' '}
            · mineralising{' '}
            <span className="font-mono text-ink-2">{readout.mineralised.toFixed(3)} g/h</span>
          </div>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-track">
            {readout.sources.map((source) => (
              <span
                key={source.key}
                className={TONE[source.key]}
                style={{ width: `${source.share * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-1 font-mono text-[10px] text-ink-3">
            {leading.length > 0 ? leading.join(' · ') : 'nothing producing'}
          </div>
        </div>

        <div className="w-px shrink-0 bg-hairline max-sm:hidden" />

        <div className="min-w-0 flex-1">
          <FieldLabel>Sources · per hour</FieldLabel>
          {readout.sources.map((source) => (
            <DataRow
              key={source.key}
              label={
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-[2px] ${TONE[source.key]}`} />
                  {source.label}
                </span>
              }
            >
              {source.gramsPerHour.toFixed(3)} g
            </DataRow>
          ))}
          <div className="pt-1 font-mono text-[10px] text-ink-3">
            {readout.food.toFixed(2)} g food · {(readout.decayRate * 100).toFixed(1)} %/h decay ·{' '}
            {(config.decay.wasteConversionRatio * 100).toFixed(0)} % to waste · Q10{' '}
            {readout.q10.toFixed(2)}×
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <p className="text-[11px] leading-snug text-ink-3">{wasteSummary(readout, config)}</p>
      </CardFooter>
    </Card>
  );
}
