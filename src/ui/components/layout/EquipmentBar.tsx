import React, { useState } from 'react';
import { Container, Waves, Thermometer, Cloud, Droplets, Wind, Mountain, Sun } from 'lucide-react';
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
import { HardscapeCard, HardscapeState, HardscapeType } from '../equipment/HardscapeCard';
import { LightCard, LightState } from '../equipment/LightCard';
import type { DailySchedule } from '../../../simulation/index.js';

interface EquipmentBarProps {
  tank: TankState;
  heater: HeaterState;
  lid: LidState;
  ato: AutoTopOffState;
  filter: FilterState;
  powerhead: PowerheadState;
  substrate: SubstrateState;
  hardscape: HardscapeState;
  hardscapeSlots: number;
  light: LightState;
  isLightOn: boolean;
  onTankCapacityChange: (capacity: number) => void;
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
  onHardscapeAddItem: (type: HardscapeType) => void;
  onHardscapeRemoveItem: (id: string) => void;
  onLightEnabledChange: (enabled: boolean) => void;
  onLightWattageChange: (wattage: number) => void;
  onLightScheduleChange: (schedule: DailySchedule) => void;
}

export function EquipmentBar({
  tank,
  heater,
  lid,
  ato,
  filter,
  powerhead,
  substrate,
  hardscape,
  hardscapeSlots,
  light,
  isLightOn,
  onTankCapacityChange,
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
  onHardscapeAddItem,
  onHardscapeRemoveItem,
  onLightEnabledChange,
  onLightWattageChange,
  onLightScheduleChange,
}: EquipmentBarProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sticky top-[57px] z-10 bg-panel border-b border-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between bg-border/40 hover:bg-border/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">Equipment</span>
          {!isExpanded && (
            <div className="flex items-center gap-3">
              {/* Tank info */}
              <div className="flex items-center gap-1">
                <Container className="w-4 h-4 text-accent-blue" />
                <span className="text-xs text-gray-400">Tank {tank.capacity}L</span>
              </div>
              {/* Filter status */}
              {filter.enabled && (
                <div className="flex items-center gap-1">
                  <Waves className="w-4 h-4 text-accent-blue" />
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-xs text-gray-400">Filter</span>
                </div>
              )}
              {/* Light status */}
              {light.enabled && (
                <div className="flex items-center gap-1">
                  <Sun className="w-4 h-4 text-accent-yellow" />
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  {isLightOn && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  )}
                  <span className="text-xs text-gray-400">Light</span>
                </div>
              )}
              {/* Heater status */}
              {heater.enabled && (
                <div className="flex items-center gap-1">
                  <Thermometer className="w-4 h-4 text-accent-orange" />
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  {heater.isOn && (
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  <span className="text-xs text-gray-400">Heater</span>
                </div>
              )}
              {/* Substrate status */}
              {substrate.type !== 'none' && (
                <div className="flex items-center gap-1">
                  {getSubstrateIcon(substrate.type)}
                  <span className="text-xs text-gray-400">
                    {formatSubstrateName(substrate.type)}
                  </span>
                </div>
              )}
              {/* Lid status */}
              {lid.type !== 'none' && (
                <div className="flex items-center gap-1">
                  <Cloud className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    {lid.type === 'full' ? 'Full lid' : lid.type === 'mesh' ? 'Mesh lid' : 'Sealed lid'}
                  </span>
                </div>
              )}
              {/* ATO status */}
              {ato.enabled && (
                <div className="flex items-center gap-1">
                  <Droplets className="w-4 h-4 text-accent-blue" />
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-xs text-gray-400">ATO</span>
                </div>
              )}
              {/* Powerhead status */}
              {powerhead.enabled && (
                <div className="flex items-center gap-1">
                  <Wind className="w-4 h-4 text-gray-400" />
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-xs text-gray-400">Powerhead</span>
                </div>
              )}
              {/* Hardscape status */}
              {hardscape.items.length > 0 && (
                <div className="flex items-center gap-1">
                  <Mountain className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    Hardscape ({hardscape.items.length})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="pl-4 pr-4 pt-3 pb-4 overflow-x-auto">
          <div className="flex gap-3 items-stretch">
            <TankCard tank={tank} onCapacityChange={onTankCapacityChange} />

            {/* Divider */}
            <div className="w-px bg-border flex-shrink-0 self-stretch" />

            <FilterCard
              filter={filter}
              onEnabledChange={onFilterEnabledChange}
              onTypeChange={onFilterTypeChange}
            />
            <LightCard
              light={light}
              isCurrentlyOn={isLightOn}
              onEnabledChange={onLightEnabledChange}
              onWattageChange={onLightWattageChange}
              onScheduleChange={onLightScheduleChange}
            />
            <HeaterCard
              heater={heater}
              onEnabledChange={onHeaterEnabledChange}
              onTargetTemperatureChange={onHeaterTargetTemperatureChange}
              onWattageChange={onHeaterWattageChange}
            />
            <SubstrateCard
              substrate={substrate}
              tankCapacity={tank.capacity}
              onTypeChange={onSubstrateTypeChange}
            />
            <HardscapeCard
              hardscape={hardscape}
              usedSlots={hardscape.items.length}
              totalSlots={hardscapeSlots}
              onAddItem={onHardscapeAddItem}
              onRemoveItem={onHardscapeRemoveItem}
            />
            <LidCard lid={lid} onTypeChange={onLidTypeChange} />

            {/* Divider */}
            <div className="w-px bg-border flex-shrink-0 self-stretch" />

            <AutoTopOffCard ato={ato} onEnabledChange={onAtoEnabledChange} />
            <PowerheadCard
              powerhead={powerhead}
              onEnabledChange={onPowerheadEnabledChange}
              onFlowRateChange={onPowerheadFlowRateChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
