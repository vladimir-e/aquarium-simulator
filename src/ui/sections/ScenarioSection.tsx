import React from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { Stage } from '../components/layout/Stage';
import { ScenarioColumn } from '../components/build/ScenarioColumn';

export function ScenarioSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  return (
    <Stage title="Scenario" meta="tank · environment · units">
      <div className="max-w-xl">
        <ScenarioColumn sim={sim} config={config} />
      </div>
    </Stage>
  );
}
