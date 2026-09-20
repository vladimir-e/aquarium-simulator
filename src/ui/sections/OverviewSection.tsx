import React, { useMemo, useState } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import { useStage } from '../components/layout/AppShell';
import { GearWidget } from '../components/overview/GearWidget';
import { LifeWidget } from '../components/overview/LifeWidget';
import { NeedsStrip } from '../components/overview/NeedsStrip';
import { NitrogenWidget } from '../components/overview/NitrogenWidget';
import { NutrientsWidget } from '../components/overview/NutrientsWidget';
import { WaterWidget } from '../components/overview/WaterWidget';
import { ReadingDrawer } from '../components/water/ReadingDrawer';
import type { useSimulation } from '../hooks/useSimulation';
import { useUnits } from '../hooks/useUnits';
import { readTank, type ReadingId } from '../readings';

/**
 * The bird's-eye: what needs the keeper above a grid of windows onto the five
 * things a tank is. Widgets are content-height, so a bare tank shows a short
 * dashboard rather than five half-empty panels.
 */
export function OverviewSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { needs, onAct } = useStage();
  const { unitSystem } = useUnits();
  const { state, history } = sim;
  const [reading, setReading] = useState<ReadingId | null>(null);

  const book = useMemo(
    () => readTank({ state, config, history, units: unitSystem }),
    [state, config, history, unitSystem]
  );

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <NeedsStrip needs={needs} book={book} />

        <div className="grid grid-cols-3 content-start items-start gap-3 max-md:grid-cols-1">
          <NitrogenWidget
            book={book}
            config={config}
            onOpenReading={setReading}
            className="col-span-2 max-md:col-span-1"
          />
          <LifeWidget book={book} state={state} onOpenReading={setReading} onAct={onAct} />
          <WaterWidget book={book} state={state} onOpenReading={setReading} onAct={onAct} />
          <GearWidget book={book} sim={sim} />
          <NutrientsWidget book={book} state={state} onOpenReading={setReading} onAct={onAct} />
        </div>
      </div>

      <ReadingDrawer id={reading} book={book} history={history} onClose={() => setReading(null)} />
    </>
  );
}
