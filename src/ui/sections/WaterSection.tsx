import React, { useMemo, useState } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import { useStage } from '../components/layout/AppShell';
import { ModulePage } from '../components/layout/ModulePage';
import { BiofilterWidget } from '../components/water/BiofilterWidget';
import { ReadingDrawer } from '../components/water/ReadingDrawer';
import { NutrientRows, ReadingRows } from '../components/water/rows';
import { WasteWidget } from '../components/water/WasteWidget';
import { VerbButton } from '../components/ui/VerbButton';
import type { useSimulation } from '../hooks/useSimulation';
import { useUnits } from '../hooks/useUnits';
import { readTank, type ReadingId } from '../readings';

const WATER: ReadingId[] = ['temperature', 'ph', 'level'];
const GASES: ReadingId[] = ['oxygen', 'co2'];
const NITROGEN: ReadingId[] = ['ammonia', 'nitrite', 'nitrate'];

/** A headed run of reading rows — the sheet's only structure below the column. */
function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="pt-2.5 first:pt-0">
      <h2 className="pb-1 text-[13px] font-medium leading-[18px] text-ink-2">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The lab sheet: every reading the tank takes, in two columns that read top to
 * bottom — the water and what is dissolved in it on the left, the cycle and
 * the bacteria running it on the right. Any row opens the same inspector the
 * Overview opens.
 */
export function WaterSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { onAct } = useStage();
  const { unitSystem } = useUnits();
  const { state, history } = sim;
  const [reading, setReading] = useState<ReadingId | null>(null);

  const book = useMemo(
    () => readTank({ state, config, history, units: unitSystem }),
    [state, config, history, unitSystem]
  );

  return (
    <>
      <ModulePage
        title="Water"
        meta={book.caption}
        actions={
          <>
            <VerbButton label="Water change · 25 %" onClick={onAct} />
            <VerbButton label="Top off" onClick={onAct} />
          </>
        }
      >
        <div className="grid grid-cols-1 items-start gap-x-6 md:grid-cols-2">
          <div>
            <Group title="Water">
              <ReadingRows book={book} ids={WATER} onOpen={setReading} />
            </Group>
            <Group title="Gases">
              <ReadingRows book={book} ids={GASES} onOpen={setReading} />
            </Group>
            <Group title="Nutrients">
              <NutrientRows book={book} onOpen={setReading} />
            </Group>
          </div>

          <div className="flex flex-col gap-3 max-md:pt-2.5">
            <Group title="Nitrogen">
              <ReadingRows book={book} ids={NITROGEN} onOpen={setReading} />
            </Group>
            <BiofilterWidget book={book} config={config} />
            <WasteWidget book={book} config={config} onOpen={setReading} />
          </div>
        </div>
      </ModulePage>

      <ReadingDrawer id={reading} book={book} history={history} onClose={() => setReading(null)} />
    </>
  );
}
