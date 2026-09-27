import React, { useState } from 'react';
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
import { useReadingBook } from '../hooks/useReadingBook';
import {type ReadingId} from '../readings';

/**
 * The bird's-eye: what needs the keeper above windows onto the five things a
 * tank is. Widgets are content-height, so a bare tank shows a short dashboard
 * rather than five half-empty panels. A phone stacks them; a tablet runs the
 * chain, the roster and the rack full width with the two sheets of readings
 * side by side; a desk-wide stage gives the roster and the plant food a column
 * of their own, so neither side waits on the other's height.
 */
export function OverviewSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { needs, onAct, actLabel } = useStage();
  const { state, history } = sim;
  const [reading, setReading] = useState<ReadingId | null>(null);

  const book = useReadingBook(sim, config);

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <NeedsStrip needs={needs} onAct={onAct} />

        <div className="grid content-start items-start gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr]">
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-3">
            <NitrogenWidget
              book={book}
              onOpenReading={setReading}
              className="max-xl:order-1 md:col-span-2"
            />
            <div className="contents xl:grid xl:grid-cols-2 xl:items-start xl:gap-3">
              <WaterWidget
                book={book}
                onOpenReading={setReading}
                onAct={onAct}
                actLabel={actLabel}
                className="max-xl:order-3"
              />
              <GearWidget
                book={book}
                sim={sim}
                onOpenReading={setReading}
                className="max-md:order-4 md:max-xl:order-5 md:col-span-2 xl:col-span-1"
              />
            </div>
          </div>
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-3">
            <LifeWidget
              book={book}
              state={state}
              onOpenReading={setReading}
              onAct={onAct}
              actLabel={actLabel}
              className="max-xl:order-2 md:col-span-2"
            />
            <NutrientsWidget
              book={book}
              state={state}
              onOpenReading={setReading}
              onAct={onAct}
              actLabel={actLabel}
              className="max-md:order-5 md:max-xl:order-4"
            />
          </div>
        </div>
      </div>

      <ReadingDrawer id={reading} book={book} history={history} onClose={() => setReading(null)} />
    </>
  );
}
