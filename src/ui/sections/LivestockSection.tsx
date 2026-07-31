import React, { useMemo, useState } from 'react';
import type { FishSpecies } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useUnits } from '../hooks/useUnits';
import { Stage } from '../components/layout/Stage';
import { Card, CardFooter } from '../components/run/Card';
import { Bar, RunButton } from '../components/run/elements';
import { AddFish } from '../components/livestock/AddFish';
import { RosterTable } from '../components/livestock/RosterTable';
import { bioload, bioloadNote } from '../build';
import { countFry, rosterRows, rosterSummary } from '../run';

/**
 * The roster, as a table. This is the one section whose content is unbounded,
 * so the table is the only thing that scrolls — the column header and the
 * bioload reading are pinned either side of it.
 */
export function LivestockSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  const { unitSystem } = useUnits();
  const [expanded, setExpanded] = useState<ReadonlySet<FishSpecies>>(new Set());

  const { state } = sim;
  const rows = useMemo(
    () => rosterRows(state, config.livestock, expanded),
    [state, config.livestock, expanded]
  );
  const load = useMemo(() => bioload(state.fish, state.tank.capacity), [state]);
  const fryCount = countFry(state.fish);

  const toggleSpecies = (species: FishSpecies): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(species)) next.add(species);
      return next;
    });

  return (
    <Stage
      title="Livestock"
      meta={rosterSummary(state)}
      actions={!isMobile && <AddFish sim={sim} opens="down" />}
      fills
    >
      <Card className="h-full">
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {rows.length === 0 ? (
            <p className="py-6 text-[13px] text-ink-3">No fish yet — add one to begin.</p>
          ) : (
            <RosterTable
              rows={rows}
              onToggleSpecies={toggleSpecies}
              onRemoveFish={(fishId) => sim.executeAction({ type: 'removeFish', fishId })}
            />
          )}
        </div>

        <CardFooter className="shrink-0 gap-x-3">
          {fryCount > 0 && (
            <RunButton onClick={() => sim.executeAction({ type: 'sellFry' })}>
              Sell {fryCount} fry
            </RunButton>
          )}

          <span className="flex items-center gap-2">
            <span className="text-[13px] text-ink-2">Bioload</span>
            <Bar className="w-24 sm:w-[180px]" value={load.pct} status={load.status} />
            <span className="font-mono text-[14px] tabular-nums text-ink">
              {load.ratio.toFixed(1)}×
            </span>
            <span className="text-[12px] text-ink-3">vs guideline</span>
          </span>
          <span className="ml-auto hidden text-[12px] text-ink-3 sm:inline">
            {bioloadNote(load, unitSystem)}
          </span>

          {isMobile && <AddFish sim={sim} opens="up" />}
        </CardFooter>
      </Card>
    </Stage>
  );
}
