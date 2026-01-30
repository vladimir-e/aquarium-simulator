import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Wind } from 'lucide-react';
import {
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  isFilterAirDriven,
  type AirPump,
  type FilterType,
} from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { lphToGph } from '../../utils/units';

export interface AirPumpState {
  enabled: boolean;
}

interface AirPumpCardProps {
  airPump: AirPumpState;
  tankCapacity: number;
  filterEnabled: boolean;
  filterType: FilterType;
  onEnabledChange: (enabled: boolean) => void;
}

export function AirPumpCard({
  airPump,
  tankCapacity,
  filterEnabled,
  filterType,
  onEnabledChange,
}: AirPumpCardProps): React.JSX.Element {
  const { unitSystem } = useUnits();

  const airOutputLph = getAirPumpOutput(tankCapacity);
  const flowContributionLph = getAirPumpFlow(tankCapacity);
  const isUndersized = isAirPumpUndersized(tankCapacity);

  // Check if sponge filter is already providing aeration
  const spongeFilterActive = filterEnabled && isFilterAirDriven(filterType);

  // Format air output based on unit system
  const airOutputDisplay =
    unitSystem === 'imperial'
      ? `${Math.round(lphToGph(airOutputLph))} GPH`
      : `${airOutputLph} L/h`;

  // Format flow contribution
  const flowDisplay =
    unitSystem === 'imperial'
      ? `+${Math.round(lphToGph(flowContributionLph))} GPH`
      : `+${flowContributionLph} L/h`;

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Wind className="w-4 h-4 text-accent-blue" />
        <h4 className="text-sm font-medium text-gray-200">Air Pump</h4>
      </div>

      <div className="space-y-3 flex-1">
        <Toggle label="Enabled" checked={airPump.enabled} onChange={onEnabledChange} />

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Air Output:</span>
            <span className="text-gray-300">{airOutputDisplay}</span>
          </div>
          <div className="flex justify-between">
            <span>Flow Boost:</span>
            <span className="text-gray-300">{flowDisplay}</span>
          </div>
        </div>

        {spongeFilterActive && !airPump.enabled && (
          <div className="text-xs text-accent-blue">
            Sponge filter already provides aeration
          </div>
        )}

        {airPump.enabled && spongeFilterActive && (
          <div className="text-xs text-gray-400">
            Additional aeration (stacks with sponge filter)
          </div>
        )}

        {isUndersized && airPump.enabled && (
          <div className="text-xs text-warning">
            Warning: Tank may need multiple air stones
          </div>
        )}

        {airPump.enabled && (
          <div className="text-xs text-gray-400">
            Increases O2, accelerates CO2 off-gassing
          </div>
        )}

        {!airPump.enabled && !spongeFilterActive && (
          <div className="text-xs text-gray-400">
            Adds oxygen and surface agitation
          </div>
        )}
      </div>
    </div>
  );
}
