import React, { useState } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { Stage } from '../components/layout/Stage';
import { EquipmentColumn } from '../components/build/EquipmentColumn';
import { SystemsCard } from '../components/run/SystemsCard';

export function EquipmentSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  return (
    <Stage title="Equipment" meta="devices · biofilter">
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1.4fr]">
        <SystemsCard
          state={sim.state}
          config={config}
          executeAction={sim.executeAction}
          onSelectDevice={setSelectedDeviceId}
        />
        {/* EquipmentColumn seeds its selection on mount, so a new pick remounts it. */}
        <EquipmentColumn key={selectedDeviceId} sim={sim} selectedDeviceId={selectedDeviceId} />
      </div>
    </Stage>
  );
}
