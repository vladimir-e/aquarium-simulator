import React from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { Stage } from '../components/layout/Stage';
import { StockingColumn } from '../components/build/StockingColumn';
import { LivestockCard } from '../components/run/LivestockCard';

export function LivestockSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  return (
    <Stage title="Livestock" meta="roster · bioload">
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <LivestockCard state={sim.state} config={config.livestock} executeAction={sim.executeAction} />
        <StockingColumn sim={sim} />
      </div>
    </Stage>
  );
}
