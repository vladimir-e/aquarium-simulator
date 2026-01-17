import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Wind } from 'lucide-react';
import { POWERHEAD_FLOW_LPH, type PowerheadFlowRate } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { formatFlowRate } from '../../utils/units';

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

// Tank size recommendations in both unit systems
const TANK_SIZE_RECOMMENDATIONS_IMPERIAL: Record<PowerheadFlowRate, string> = {
  240: '5-20 gal',
  400: '20-30 gal',
  600: '30-50 gal',
  850: '50-80 gal',
};

const TANK_SIZE_RECOMMENDATIONS_METRIC: Record<PowerheadFlowRate, string> = {
  240: '20-75 L',
  400: '75-115 L',
  600: '115-190 L',
  850: '190-300 L',
};

export function PowerheadCard({
  powerhead,
  onEnabledChange,
  onFlowRateChange,
}: PowerheadCardProps): React.JSX.Element {
  const { unitSystem } = useUnits();

  const recommendations =
    unitSystem === 'imperial'
      ? TANK_SIZE_RECOMMENDATIONS_IMPERIAL
      : TANK_SIZE_RECOMMENDATIONS_METRIC;

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Wind className="w-4 h-4 text-gray-400" />
        <h4 className="text-sm font-medium text-gray-200">Powerhead</h4>
      </div>

      <div className="space-y-3 flex-1">
        <Toggle label="Enabled" checked={powerhead.enabled} onChange={onEnabledChange} />

        <Select
          label="Flow Rate"
          value={powerhead.flowRateGPH}
          onChange={(e) => onFlowRateChange(Number(e.target.value) as PowerheadFlowRate)}
        >
          {FLOW_RATE_OPTIONS.map((gph) => (
            <option key={gph} value={gph}>
              {unitSystem === 'imperial' ? `${gph} GPH` : `${POWERHEAD_FLOW_LPH[gph]} L/h`}
            </option>
          ))}
        </Select>

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Output:</span>
            <span className="text-gray-300">{formatFlowRate(powerhead.flowRateGPH, unitSystem)}</span>
          </div>
          <div className="flex justify-between">
            <span>Recommended:</span>
            <span className="text-gray-300">{recommendations[powerhead.flowRateGPH]}</span>
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
