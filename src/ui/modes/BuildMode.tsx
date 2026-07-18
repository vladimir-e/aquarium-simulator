import React from 'react';
import type { useSimulation } from '../hooks/useSimulation';
import type { TunableConfig } from '../../simulation/config/index.js';
import { ScenarioColumn } from '../components/build/ScenarioColumn';
import { EquipmentColumn } from '../components/build/EquipmentColumn';
import { ScapeColumn } from '../components/build/ScapeColumn';
import { StockingColumn } from '../components/build/StockingColumn';
import { BuildStatusBar } from '../components/build/BuildStatusBar';

interface BuildModeProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
  /** Device id carried in from a Systems row tap in Run, or null. */
  selectedDeviceId: string | null;
  /** Leave Build for Run and resume playing. */
  onResumeRun: () => void;
}

/**
 * Build mode: the four entity groups from Run in an editing context —
 * scenario, equipment (list + inspector), scape & flora, and stocking. The sim
 * is paused here, so surface-area math, schedules, and the bioload preview all
 * live in this mode and Run stays calm.
 */
export function BuildMode({
  sim,
  config,
  selectedDeviceId,
  onResumeRun,
}: BuildModeProps): React.JSX.Element {
  return (
    <div>
      <div className="px-4 pt-4">
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[0.9fr_1.5fr_1.05fr_1.05fr]">
          <ScenarioColumn sim={sim} config={config} />
          <EquipmentColumn sim={sim} selectedDeviceId={selectedDeviceId} />
          <ScapeColumn sim={sim} />
          <StockingColumn sim={sim} onResumeRun={onResumeRun} />
        </div>
      </div>
      <div className="mt-4">
        <BuildStatusBar logs={sim.state.logs} onResumeRun={onResumeRun} />
      </div>
    </div>
  );
}
