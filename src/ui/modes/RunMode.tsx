import React from 'react';
import type { useSimulation } from '../hooks/useSimulation';
import type { TunableConfig } from '../../simulation/config/index.js';
import { VitalsStrip } from '../components/run/VitalsStrip';
import { LivestockCard } from '../components/run/LivestockCard';
import { FloraCard } from '../components/run/FloraCard';
import { SystemsCard } from '../components/run/SystemsCard';
import { LogStrip } from '../components/run/LogStrip';

interface RunModeProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
  /** Carry a device selection into Build (its editor opens there). */
  onOpenDeviceInBuild: (deviceId: string) => void;
}

export function RunMode({ sim, config, onOpenDeviceInBuild }: RunModeProps): React.JSX.Element {
  const { state } = sim;
  return (
    <div>
      <div className="space-y-4 px-4 pt-4">
        <VitalsStrip state={state} history={sim.history} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <LivestockCard
            state={state}
            config={config.livestock}
            executeAction={sim.executeAction}
          />
          <FloraCard state={state} config={config} executeAction={sim.executeAction} />
          <SystemsCard
            state={state}
            executeAction={sim.executeAction}
            onOpenDeviceInBuild={onOpenDeviceInBuild}
          />
        </div>
      </div>
      <div className="mt-4">
        <LogStrip logs={state.logs} />
      </div>
    </div>
  );
}
