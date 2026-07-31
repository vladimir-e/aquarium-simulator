import React, { useMemo } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { useUnits } from '../hooks/useUnits';
import { Stage } from '../components/layout/Stage';
import { GaugeGroup } from '../components/run/Gauge';
import { BacteriaCard } from '../components/run/BacteriaCard';
import { WasteCard } from '../components/run/WasteCard';
import { Pill, type PillVariant } from '../components/run/elements';
import {
  bacteriaReadout,
  projectNitritePeak,
  waterAlert,
  waterGauges,
  wasteReadout,
  type Status,
} from '../run';

const PILL_VARIANT: Record<Status, PillVariant> = {
  ok: 'ok',
  warn: 'warn',
  alert: 'alert',
  neutral: 'neutral',
};

export function WaterSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { unitSystem } = useUnits();
  const { state, history } = sim;

  const gauges = useMemo(
    () => waterGauges({ state, phConfig: config.ph, history, units: unitSystem }),
    [state, config.ph, history, unitSystem]
  );
  const bacteria = useMemo(() => bacteriaReadout(state, config), [state, config]);
  const projection = useMemo(() => projectNitritePeak(state, config), [state, config]);
  const waste = useMemo(() => wasteReadout(state, config), [state, config]);

  const alert = waterAlert(
    gauges.map((g) => ({ key: g.key, label: g.name, value: g.value, status: g.status })),
    bacteria.cycled
  );

  return (
    <Stage
      title="Water"
      meta="six gauges · bacteria · waste"
      actions={
        alert && <Pill variant={PILL_VARIANT[alert.status]}>{alert.text}</Pill>
      }
    >
      <div className="flex min-h-full flex-col gap-3">
        <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2">
          <GaugeGroup title="Water" gauges={gauges.slice(0, 3)} />
          <GaugeGroup title="Nitrogen cycle" gauges={gauges.slice(3)} />
        </div>
        <div className="grid min-h-[249px] flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <BacteriaCard
            readout={bacteria}
            projection={projection}
            config={config.nitrogenCycle}
          />
          <WasteCard readout={waste} config={config} />
        </div>
      </div>
    </Stage>
  );
}
