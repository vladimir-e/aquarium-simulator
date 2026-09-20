import React, { useMemo, useState } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import { useStage } from '../components/layout/AppShell';
import { ModuleGroup, ModulePage } from '../components/layout/ModulePage';
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
        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-2.5 md:grid-cols-2">
          <div>
            <ModuleGroup title="Water">
              <ReadingRows book={book} ids={WATER} onOpen={setReading} />
            </ModuleGroup>
            <ModuleGroup title="Gases">
              <ReadingRows book={book} ids={GASES} onOpen={setReading} />
            </ModuleGroup>
            <ModuleGroup title="Nutrients">
              <NutrientRows book={book} onOpen={setReading} />
            </ModuleGroup>
          </div>

          <div className="flex flex-col gap-3">
            <ModuleGroup title="Nitrogen">
              <ReadingRows book={book} ids={NITROGEN} onOpen={setReading} />
            </ModuleGroup>
            <BiofilterWidget book={book} config={config} />
            <WasteWidget book={book} config={config} onOpen={setReading} />
          </div>
        </div>
      </ModulePage>

      <ReadingDrawer id={reading} book={book} history={history} onClose={() => setReading(null)} />
    </>
  );
}
