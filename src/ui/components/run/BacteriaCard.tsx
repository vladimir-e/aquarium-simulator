import React from 'react';
import type { NitrogenCycleConfig } from '../../../simulation/config/index.js';
import { SurfaceResource } from '../../../simulation/resources/index.js';
import {
  bacteriaSummary,
  colonyCount,
  cycleWord,
  type BacteriaReadout,
  type Colony,
  type CycleProjection,
  type Status,
} from '../../run';
import { Card, CardBody, CardFooter, CardHeader } from './Card';
import { Bar, DataRow, FieldLabel } from './elements';

/** A biofilter that is not keeping up is the one thing worth colouring here. */
function colonyStatus(colony: Colony, cycled: boolean): Status {
  if (colony.count <= 0) return 'neutral';
  return cycled ? 'ok' : 'warn';
}

function ColonyBar({
  name,
  reaction,
  colony,
  cycled,
}: {
  name: string;
  reaction: string;
  colony: Colony;
  cycled: boolean;
}): React.JSX.Element {
  return (
    <div className="py-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold">{name}</span>
        <span className="text-[11px] text-ink-3">{reaction}</span>
        <span className="ml-auto font-mono text-[13px] tabular-nums">
          {colonyCount(colony.count)}{' '}
          <span className="text-ink-3">/ {colonyCount(colony.ceiling)}</span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Bar value={colony.pct} status={colonyStatus(colony, cycled)} className="flex-1" />
        <span className="w-9 text-right font-mono text-[11px] tabular-nums text-ink-2">
          {colony.pct >= 1 || colony.pct === 0 ? Math.round(colony.pct) : '<1'} %
        </span>
      </div>
    </div>
  );
}

export function BacteriaCard({
  readout,
  projection,
  config,
}: {
  readout: BacteriaReadout;
  projection: CycleProjection | null;
  config: NitrogenCycleConfig;
}): React.JSX.Element {
  const { rates } = readout;
  const ppm = (value: number): string => value.toFixed(4);

  return (
    <Card className="min-h-0">
      <CardHeader title="Bacteria" meta={cycleWord(readout.cycled)} />
      <CardBody className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <FieldLabel>Colonies · cells / ceiling</FieldLabel>
          <ColonyBar name="AOB" reaction="NH₃ → NO₂" colony={readout.aob} cycled={readout.cycled} />
          <ColonyBar name="NOB" reaction="NO₂ → NO₃" colony={readout.nob} cycled={readout.cycled} />
          <div className="pt-1 font-mono text-[10px] text-ink-3">
            ceiling {colonyCount(readout.aob.ceiling)} = {SurfaceResource.format(readout.surface)}{' '}
            biofilm × {config.bacteriaPerCm2} M/cm²
          </div>
        </div>

        <div className="w-px shrink-0 bg-hairline max-sm:hidden" />

        <div className="min-w-0 flex-1">
          <FieldLabel>Conversion · per hour</FieldLabel>
          <DataRow label="Waste → NH₃">+{ppm(rates.wasteToAmmonia)} ppm</DataRow>
          <DataRow label="Gills → NH₃">+{ppm(rates.gillsToAmmonia)} ppm</DataRow>
          <DataRow label="NH₃ → NO₂">{ppm(rates.ammoniaToNitrite)} ppm</DataRow>
          <DataRow label="NO₂ → NO₃">{ppm(rates.nitriteToNitrate)} ppm</DataRow>
          <DataRow
            label="net NO₂"
            className={
              rates.netNitrite > 0
                ? 'font-semibold text-alert'
                : rates.netNitrite < 0
                  ? 'text-ok'
                  : 'text-ink-3'
            }
          >
            {rates.netNitrite > 0 ? '+' : ''}
            {ppm(rates.netNitrite)} ppm
          </DataRow>
        </div>
      </CardBody>
      <CardFooter>
        <p className="text-[11px] leading-snug text-ink-3">
          {bacteriaSummary(readout, projection, config)}
        </p>
      </CardFooter>
    </Card>
  );
}
