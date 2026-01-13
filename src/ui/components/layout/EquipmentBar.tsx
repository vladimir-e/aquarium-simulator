import React, { useState } from 'react';
import { HeaterCard, HeaterState } from '../equipment/HeaterCard';
import { LidCard, LidState, LidType } from '../equipment/LidCard';
import { AutoTopOffCard, AutoTopOffState } from '../equipment/AutoTopOffCard';
import { TankCard, TankState } from '../equipment/TankCard';
import { FilterCard, FilterState, FilterType } from '../equipment/FilterCard';
import { PowerheadCard, PowerheadState, PowerheadFlowRate } from '../equipment/PowerheadCard';
import {
  SubstrateCard,
  SubstrateState,
  SubstrateType,
  getSubstrateIcon,
  formatSubstrateName,
} from '../equipment/SubstrateCard';

interface EquipmentBarProps {
  tank: TankState;
  heater: HeaterState;
  lid: LidState;
  ato: AutoTopOffState;
  filter: FilterState;
  powerhead: PowerheadState;
  substrate: SubstrateState;
  onHeaterEnabledChange: (enabled: boolean) => void;
  onHeaterTargetTemperatureChange: (temp: number) => void;
  onHeaterWattageChange: (wattage: number) => void;
  onLidTypeChange: (type: LidType) => void;
  onAtoEnabledChange: (enabled: boolean) => void;
  onFilterEnabledChange: (enabled: boolean) => void;
  onFilterTypeChange: (type: FilterType) => void;
  onPowerheadEnabledChange: (enabled: boolean) => void;
  onPowerheadFlowRateChange: (flowRateGPH: PowerheadFlowRate) => void;
  onSubstrateTypeChange: (type: SubstrateType) => void;
}

export function EquipmentBar({
  tank,
  heater,
  lid,
  ato,
  filter,
  powerhead,
  substrate,
  onHeaterEnabledChange,
  onHeaterTargetTemperatureChange,
  onHeaterWattageChange,
  onLidTypeChange,
  onAtoEnabledChange,
  onFilterEnabledChange,
  onFilterTypeChange,
  onPowerheadEnabledChange,
  onPowerheadFlowRateChange,
  onSubstrateTypeChange,
}: EquipmentBarProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sticky top-[57px] z-10 bg-panel border-b border-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-border transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">Equipment</span>
          {!isExpanded && (
            <div className="flex items-center gap-2">
              {/* Heater status */}
              <div className="flex items-center gap-1">
                <span className="text-base">🌡️</span>
                {heater.enabled && (
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                {heater.isOn && (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <span className="text-xs text-gray-400">Heater</span>
              </div>
              {/* Filter status */}
              <div className="flex items-center gap-1">
                <span className="text-base">🌊</span>
                {filter.enabled && (
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                <span className="text-xs text-gray-400">Filter</span>
              </div>
              {/* Powerhead status */}
              <div className="flex items-center gap-1">
                <span className="text-base">💨</span>
                {powerhead.enabled && (
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                <span className="text-xs text-gray-400">Powerhead</span>
              </div>
              {/* Lid status */}
              <div className="flex items-center gap-1">
                <span className="text-base">🔲</span>
                {lid.type !== 'none' && (
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                <span className="text-xs text-gray-400">Lid</span>
              </div>
              {/* Substrate status */}
              {substrate.type !== 'none' && (
                <div className="flex items-center gap-1">
                  <span className="text-base">{getSubstrateIcon(substrate.type)}</span>
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-xs text-gray-400">
                    {formatSubstrateName(substrate.type)}
                  </span>
                </div>
              )}
              {/* ATO status */}
              <div className="flex items-center gap-1">
                <span className="text-base">💧</span>
                {ato.enabled && (
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                <span className="text-xs text-gray-400">ATO</span>
              </div>
            </div>
          )}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 overflow-x-auto">
          <div className="flex gap-3">
            <TankCard tank={tank} />
            <HeaterCard
              heater={heater}
              onEnabledChange={onHeaterEnabledChange}
              onTargetTemperatureChange={onHeaterTargetTemperatureChange}
              onWattageChange={onHeaterWattageChange}
            />
            <FilterCard
              filter={filter}
              onEnabledChange={onFilterEnabledChange}
              onTypeChange={onFilterTypeChange}
            />
            <PowerheadCard
              powerhead={powerhead}
              onEnabledChange={onPowerheadEnabledChange}
              onFlowRateChange={onPowerheadFlowRateChange}
            />
            <SubstrateCard
              substrate={substrate}
              tankCapacity={tank.capacity}
              onTypeChange={onSubstrateTypeChange}
            />
            <LidCard lid={lid} onTypeChange={onLidTypeChange} />
            <AutoTopOffCard ato={ato} onEnabledChange={onAtoEnabledChange} />
          </div>
        </div>
      )}
    </div>
  );
}
