import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  checkFishCapacity,
  FISH_SPECIES_DATA,
  type FishSpecies,
} from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { bioload, fryLines, removalVictimId, speciesCounts } from '../../build';
import { useCardCollapse } from '../../hooks/useCardCollapse';
import { Card, CardBody, CardFooter, CardHeader, CollapseRegion } from '../run/Card';
import { Bar } from '../run/elements';
import { Adjust, Select } from './controls';

type Sim = ReturnType<typeof useSimulation>;

const FISH_SPECIES: FishSpecies[] = ['neon_tetra', 'betta', 'guppy', 'angelfish', 'corydoras'];

interface StockingColumnProps {
  sim: Sim;
  onResumeRun: () => void;
}

export function StockingColumn({ sim, onResumeRun }: StockingColumnProps): React.JSX.Element {
  const { fish, tank } = sim.state;
  const { collapsed, toggle, showToggle, regionId } = useCardCollapse('build.stocking');
  const rows = speciesCounts(fish);
  const fry = fryLines(fish);
  const load = bioload(fish, tank.capacity);
  const [speciesToAdd, setSpeciesToAdd] = useState<FishSpecies>('neon_tetra');

  const adultCount = rows.reduce((n, r) => n + r.count, 0);
  const hasFry = fry.length > 0;
  const summary = `${adultCount}${hasFry ? ' + fry' : ''} · ${load.ratio.toFixed(1)}×`;

  const canAdd = (species: FishSpecies): boolean =>
    checkFishCapacity(fish, tank.capacity, species).ok;

  const addFish = (species: FishSpecies): void => sim.executeAction({ type: 'addFish', species });
  const cull = (species: FishSpecies): void => {
    const victim = removalVictimId(fish, species);
    if (victim) sim.executeAction({ type: 'removeFish', fishId: victim });
  };

  return (
    <Card className="h-full">
      <CardHeader
        title="Stocking"
        collapsible={showToggle}
        collapsed={collapsed}
        onToggle={toggle}
        regionId={regionId}
        meta={collapsed ? <span className="sm:hidden">{summary}</span> : undefined}
      />
      <CollapseRegion collapsed={collapsed} id={regionId}>
      <CardBody>
        {rows.length === 0 && fry.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">No livestock yet — add a species below.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {rows.map((row) => (
              <div key={row.species} className="flex items-center gap-2 py-2 text-[13px]">
                <span className="text-ink">{row.name}</span>
                <span className="text-ink-3">×{row.count}</span>
                <span className="ml-auto">
                  <Adjust
                    ariaLabel={row.name}
                    onDecrement={() => cull(row.species)}
                    onIncrement={() => addFish(row.species)}
                    incDisabled={!canAdd(row.species)}
                  />
                </span>
              </div>
            ))}
            {fry.map((line) => (
              <div key={`fry-${line.species}`} className="flex items-center gap-2 py-1.5 text-[12px] text-ink-3">
                <span>{line.name} fry</span>
                <span className="font-mono tabular-nums">×{line.count}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-hairline pt-3">
          <Select
            ariaLabel="Fish species to add"
            className="flex-1"
            value={speciesToAdd}
            onChange={(v) => setSpeciesToAdd(v as FishSpecies)}
            options={FISH_SPECIES.map((s) => ({ value: s, label: FISH_SPECIES_DATA[s].name }))}
          />
          <span
            aria-disabled
            title="Sex is random — the breeding engine assigns it"
            className="inline-flex cursor-not-allowed select-none items-center gap-1 rounded-control border border-hairline px-2 py-1.5 text-[13px] text-ink-3 opacity-60"
          >
            ♂/♀
          </span>
          <button
            type="button"
            onClick={() => addFish(speciesToAdd)}
            disabled={!canAdd(speciesToAdd)}
            className="rounded-control bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Add
          </button>
        </div>

        <div className="border-t border-hairline pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-2">Bioload</span>
            <Bar className="w-24" value={load.pct} status={load.status} />
            <span className="font-mono text-[13px] tabular-nums text-ink">{load.ratio.toFixed(1)}×</span>
            <span className="text-[12px] text-ink-3">vs guideline</span>
          </div>
          <p className="pt-1 text-[12px] text-ink-3">stocking preview warns before ammonia does</p>
        </div>
      </CardBody>

      <CardFooter className="max-sm:hidden">
        <button
          type="button"
          onClick={onResumeRun}
          className="ml-auto flex items-center gap-1 rounded-control bg-accent px-3.5 py-1.5 text-[13px] font-medium text-surface transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Resume run
          <ChevronRight className="h-4 w-4" />
        </button>
      </CardFooter>
      </CollapseRegion>
    </Card>
  );
}
