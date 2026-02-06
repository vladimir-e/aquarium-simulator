import React, { useState } from 'react';
import { Container, Waves, Thermometer, Cloud, Droplets, Wind, Mountain, Sun, Sparkles, Cookie } from 'lucide-react';
import { HeaterCard, HeaterState } from '../equipment/HeaterCard';
import { LidCard, LidState, LidType } from '../equipment/LidCard';
import { AutoTopOffCard, AutoTopOffState } from '../equipment/AutoTopOffCard';
import { TankCard, TankState } from '../equipment/TankCard';
import { FilterCard, FilterState, FilterType } from '../equipment/FilterCard';
import { AirPumpCard, AirPumpState } from '../equipment/AirPumpCard';
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
import { Co2GeneratorCard, Co2GeneratorState } from '../equipment/Co2GeneratorCard';
import { AutoDoserCard, AutoDoserState } from '../equipment/AutoDoserCard';
import { AutoFeederCard, AutoFeederState } from '../equipment/AutoFeederCard';
import type { DailySchedule } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { findClosestTankSize } from '../../utils/units';

interface EquipmentBarProps {
  tank: TankState;
  heater: HeaterState;
  lid: LidState;
  ato: AutoTopOffState;
  filter: FilterState;
  airPump: AirPumpState;
  powerhead: PowerheadState;
  substrate: SubstrateState;
  hardscape: HardscapeState;
  hardscapeSlots: number;
  light: LightState;
  isLightOn: boolean;
  co2Generator: Co2GeneratorState;
  autoDoser: AutoDoserState;
  autoFeeder: AutoFeederState;
  onTankCapacityChange: (capacity: number) => void;
  onHeaterEnabledChange: (enabled: boolean) => void;
  onHeaterTargetTemperatureChange: (temp: number) => void;
  onHeaterWattageChange: (wattage: number) => void;
  onLidTypeChange: (type: LidType) => void;
  onAtoEnabledChange: (enabled: boolean) => void;
  onFilterEnabledChange: (enabled: boolean) => void;
  onFilterTypeChange: (type: FilterType) => void;
  onAirPumpEnabledChange: (enabled: boolean) => void;
  onPowerheadEnabledChange: (enabled: boolean) => void;
  onPowerheadFlowRateChange: (flowRateGPH: PowerheadFlowRate) => void;
  onSubstrateTypeChange: (type: SubstrateType) => void;
  onHardscapeAddItem: (type: HardscapeType) => void;
  onHardscapeRemoveItem: (id: string) => void;
  onLightEnabledChange: (enabled: boolean) => void;
  onLightWattageChange: (wattage: number) => void;
  onLightScheduleChange: (schedule: DailySchedule) => void;
  onCo2GeneratorEnabledChange: (enabled: boolean) => void;
  onCo2GeneratorBubbleRateChange: (bubbleRate: number) => void;
  onCo2GeneratorScheduleChange: (schedule: DailySchedule) => void;
  onAutoDoserEnabledChange: (enabled: boolean) => void;
  onAutoDoserAmountChange: (amountMl: number) => void;
  onAutoDoserScheduleChange: (schedule: DailySchedule) => void;
  onAutoFeederEnabledChange: (enabled: boolean) => void;
  onAutoFeederAmountChange: (amountGrams: number) => void;
  onAutoFeederScheduleChange: (schedule: DailySchedule) => void;
}

function formatLidName(type: string): string {
  switch (type) {
    case 'full':
      return 'Full lid';
    case 'mesh':
      return 'Mesh lid';
    case 'sealed':
      return 'Sealed lid';
    default:
      return 'Lid';
  }
}

export function EquipmentBar({
  tank,
  heater,
  lid,
  ato,
  filter,
  airPump,
  powerhead,
  substrate,
  hardscape,
  hardscapeSlots,
  light,
  isLightOn,
  co2Generator,
  autoDoser,
  autoFeeder,
  onTankCapacityChange,
  onHeaterEnabledChange,
  onHeaterTargetTemperatureChange,
  onHeaterWattageChange,
  onLidTypeChange,
  onAtoEnabledChange,
  onFilterEnabledChange,
  onFilterTypeChange,
  onAirPumpEnabledChange,
  onPowerheadEnabledChange,
  onPowerheadFlowRateChange,
  onSubstrateTypeChange,
  onHardscapeAddItem,
  onHardscapeRemoveItem,
  onLightEnabledChange,
  onLightWattageChange,
  onLightScheduleChange,
  onCo2GeneratorEnabledChange,
  onCo2GeneratorBubbleRateChange,
  onCo2GeneratorScheduleChange,
  onAutoDoserEnabledChange,
  onAutoDoserAmountChange,
  onAutoDoserScheduleChange,
  onAutoFeederEnabledChange,
  onAutoFeederAmountChange,
  onAutoFeederScheduleChange,
}: EquipmentBarProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const { unitSystem } = useUnits();

  // Get tank display label based on unit system
  const tankSize = findClosestTankSize(tank.capacity, unitSystem);

  // Mini-panel indicators configuration - order matches expanded panel
  const miniIndicators = [
    // Group 1: Tank (always visible)
    {
      key: 'tank',
      show: true,
      icon: <Container className="w-4 h-4 text-accent-blue" />,
      label: `Tank ${tankSize.display}`,
      showOnlineDot: false,
      activeDot: null,
    },
    // Group 2: Basic equipment
    {
      key: 'filter',
      show: filter.enabled,
      icon: <Waves className="w-4 h-4 text-accent-blue" />,
      label: 'Filter',
      showOnlineDot: true,
      activeDot: null,
    },
    {
      key: 'light',
      show: light.enabled,
      icon: <Sun className="w-4 h-4 text-accent-yellow" />,
      label: 'Light',
      showOnlineDot: true,
      activeDot: isLightOn ? 'bg-yellow-500' : null,
    },
    {
      key: 'heater',
      show: heater.enabled,
      icon: <Thermometer className="w-4 h-4 text-accent-orange" />,
      label: 'Heater',
      showOnlineDot: true,
      activeDot: heater.isOn ? 'bg-red-500' : null,
    },
    {
      key: 'substrate',
      show: substrate.type !== 'none',
      icon: getSubstrateIcon(substrate.type),
      label: formatSubstrateName(substrate.type),
      showOnlineDot: false,
      activeDot: null,
    },
    {
      key: 'hardscape',
      show: hardscape.items.length > 0,
      icon: <Mountain className="w-4 h-4 text-gray-400" />,
      label: `Hardscape (${hardscape.items.length})`,
      showOnlineDot: false,
      activeDot: null,
    },
    {
      key: 'lid',
      show: lid.type !== 'none',
      icon: <Cloud className="w-4 h-4 text-gray-400" />,
      label: formatLidName(lid.type),
      showOnlineDot: false,
      activeDot: null,
    },
    // Group 3: Advanced equipment
    {
      key: 'ato',
      show: ato.enabled,
      icon: <Droplets className="w-4 h-4 text-accent-blue" />,
      label: 'ATO',
      showOnlineDot: true,
      activeDot: null,
    },
    {
      key: 'co2',
      show: co2Generator.enabled,
      icon: <Sparkles className="w-4 h-4 text-accent-green" />,
      label: 'CO2',
      showOnlineDot: true,
      activeDot: co2Generator.isOn ? 'bg-green-500' : null,
    },
    {
      key: 'airPump',
      show: airPump.enabled,
      icon: <Wind className="w-4 h-4 text-accent-blue" />,
      label: 'Air Pump',
      showOnlineDot: true,
      activeDot: null,
    },
    {
      key: 'powerhead',
      show: powerhead.enabled,
      icon: <Wind className="w-4 h-4 text-gray-400" />,
      label: 'Powerhead',
      showOnlineDot: true,
      activeDot: null,
    },
    {
      key: 'autoDoser',
      show: autoDoser.enabled,
      icon: <Droplets className="w-4 h-4 text-accent-green" />,
      label: 'Auto Doser',
      showOnlineDot: true,
      activeDot: autoDoser.dosedToday ? 'bg-green-500' : null,
    },
    {
      key: 'autoFeeder',
      show: autoFeeder.enabled,
      icon: <Cookie className="w-4 h-4 text-accent-orange" />,
      label: 'Auto Feeder',
      showOnlineDot: true,
      activeDot: autoFeeder.fedToday ? 'bg-orange-500' : null,
    },
  ];

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
              {miniIndicators
                .filter((item) => item.show)
                .map((item) => (
                  <div key={item.key} className="flex items-center gap-1">
                    {item.icon}
                    {item.showOnlineDot && (
                      <div className="w-2 h-2 rounded-full bg-accent-green" />
                    )}
                    {item.activeDot && (
                      <div className={`w-2 h-2 rounded-full ${item.activeDot} animate-pulse`} />
                    )}
                    <span className="text-xs text-gray-400">{item.label}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="pl-4 pr-4 pt-3 pb-4 overflow-x-auto">
          <div className="flex gap-3 items-stretch">
            {/* Group 1: Tank */}
            <TankCard tank={tank} onCapacityChange={onTankCapacityChange} />

            <div className="w-px bg-border flex-shrink-0 self-stretch" />

            {/* Group 2: Basic equipment */}
            <FilterCard
              filter={filter}
              tankCapacity={tank.capacity}
              onEnabledChange={onFilterEnabledChange}
              onTypeChange={onFilterTypeChange}
            />
            <AirPumpCard
              airPump={airPump}
              tankCapacity={tank.capacity}
              filterEnabled={filter.enabled}
              filterType={filter.type}
              onEnabledChange={onAirPumpEnabledChange}
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

            <div className="w-px bg-border flex-shrink-0 self-stretch" />

            {/* Group 3: Advanced equipment */}
            <AutoTopOffCard ato={ato} onEnabledChange={onAtoEnabledChange} />
            <Co2GeneratorCard
              co2Generator={co2Generator}
              tankCapacity={tank.capacity}
              onEnabledChange={onCo2GeneratorEnabledChange}
              onBubbleRateChange={onCo2GeneratorBubbleRateChange}
              onScheduleChange={onCo2GeneratorScheduleChange}
            />
            <PowerheadCard
              powerhead={powerhead}
              onEnabledChange={onPowerheadEnabledChange}
              onFlowRateChange={onPowerheadFlowRateChange}
            />
            <AutoDoserCard
              autoDoser={autoDoser}
              waterVolume={tank.waterLevel}
              onEnabledChange={onAutoDoserEnabledChange}
              onDoseAmountChange={onAutoDoserAmountChange}
              onScheduleChange={onAutoDoserScheduleChange}
            />
            <AutoFeederCard
              autoFeeder={autoFeeder}
              onEnabledChange={onAutoFeederEnabledChange}
              onFeedAmountChange={onAutoFeederAmountChange}
              onScheduleChange={onAutoFeederScheduleChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
