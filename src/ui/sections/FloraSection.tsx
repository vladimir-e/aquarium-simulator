import React from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { Stage } from '../components/layout/Stage';
import { ScapeColumn } from '../components/build/ScapeColumn';
import { FloraCard } from '../components/run/FloraCard';

export function FloraSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  return (
    <Stage title="Flora & Scape" meta="plants · algae · nutrients">
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <FloraCard state={sim.state} config={config} executeAction={sim.executeAction} />
        <ScapeColumn sim={sim} />
      </div>
    </Stage>
  );
}
