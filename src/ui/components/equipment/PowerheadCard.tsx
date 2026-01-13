import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { POWERHEAD_FLOW_LPH, type PowerheadFlowRate } from '../../../simulation/index.js';

export type { PowerheadFlowRate };

export interface PowerheadState {
  enabled: boolean;
  flowRateGPH: PowerheadFlowRate;
}

interface PowerheadCardProps {
  powerhead: PowerheadState;
  onEnabledChange: (enabled: boolean) => void;
  onFlowRateChange: (flowRateGPH: PowerheadFlowRate) => void;
}

const FLOW_RATE_OPTIONS: PowerheadFlowRate[] = [240, 400, 600, 850];

const TANK_SIZE_RECOMMENDATIONS: Record<PowerheadFlowRate, string> = {
  240: '5-20 gal',
  400: '20-30 gal',
  600: '30-50 gal',
  850: '50-80 gal',
};

export function PowerheadCard({
  powerhead,
  onEnabledChange,
  onFlowRateChange,
}: PowerheadCardProps): React.JSX.Element {
  const flowLPH = POWERHEAD_FLOW_LPH[powerhead.flowRateGPH];

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💨</span>
          <h4 className="text-sm font-medium text-gray-200">Powerhead</h4>
        </div>
        {powerhead.enabled && (
          <span className="text-xs px-2 py-0.5 bg-accent-green text-white rounded">
            RUNNING
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Toggle label="Enabled" checked={powerhead.enabled} onChange={onEnabledChange} />

        <Select
          label="Flow Rate"
          value={powerhead.flowRateGPH}
          onChange={(e) => onFlowRateChange(Number(e.target.value) as PowerheadFlowRate)}
        >
          {FLOW_RATE_OPTIONS.map((gph) => (
            <option key={gph} value={gph}>
              {gph} GPH ({POWERHEAD_FLOW_LPH[gph]} L/h)
            </option>
          ))}
        </Select>

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Output:</span>
            <span className="text-gray-300">
              {powerhead.flowRateGPH} GPH / {flowLPH} L/h
            </span>
          </div>
          <div className="flex justify-between">
            <span>Recommended:</span>
            <span className="text-gray-300">
              {TANK_SIZE_RECOMMENDATIONS[powerhead.flowRateGPH]}
            </span>
          </div>
        </div>

        <div className="text-xs text-gray-400">
          {powerhead.enabled
            ? 'Increases water circulation and gas exchange'
            : 'Additional circulation - not required with filter'}
        </div>
      </div>
    </div>
  );
}
