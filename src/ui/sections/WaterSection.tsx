import React from 'react';
import type { useSimulation } from '../hooks/useSimulation';
import { Stage } from '../components/layout/Stage';
import { VitalsStrip } from '../components/run/VitalsStrip';

export function WaterSection({
  sim,
}: {
  sim: ReturnType<typeof useSimulation>;
}): React.JSX.Element {
  return (
    <Stage title="Water" meta="six gauges · bacteria · waste">
      <VitalsStrip state={sim.state} history={sim.history} />
    </Stage>
  );
}
