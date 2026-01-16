import React from 'react';
import { Timeline } from './components/layout/Timeline';
import { EquipmentBar } from './components/layout/EquipmentBar';
import { ResourcesPanel } from './components/resources/ResourcesPanel';
import { SimulationStatus } from './components/panels/SimulationStatus';
import { Environment } from './components/panels/Environment';
import { Actions } from './components/panels/Actions';
import { Visualization } from './components/panels/Visualization';
import { WaterChemistry } from './components/panels/WaterChemistry';
import { Plants } from './components/panels/Plants';
import { Livestock } from './components/panels/Livestock';
import { Log } from './components/panels/Log';
import { useSimulation } from './hooks/useSimulation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  '1hr': 1,
  '6hr': 6,
  '12hr': 12,
  '1day': 24,
};

function App(): React.JSX.Element {
  const {
    state,
    isPlaying,
    speed,
    step,
    togglePlayPause,
    changeSpeed,
    updateHeaterEnabled,
    updateHeaterTargetTemperature,
    updateHeaterWattage,
    updateRoomTemperature,
    updateTapWaterTemperature,
    updateLidType,
    updateAtoEnabled,
    updateFilterEnabled,
    updateFilterType,
    updatePowerheadEnabled,
    updatePowerheadFlowRate,
    updateSubstrateType,
    addHardscapeItem,
    removeHardscapeItem,
    updateLightEnabled,
    updateLightWattage,
    updateLightSchedule,
    changeTankCapacity,
    reset,
    executeAction,
  } = useSimulation();

  // Calculate if light is currently on from resources
  const isLightOn = state.resources.light > 0;

  useKeyboardShortcuts(step, togglePlayPause, isPlaying);

  return (
    <div className="min-h-screen bg-background text-gray-200">
      <Timeline
        isPlaying={isPlaying}
        speed={speed}
        onPlayPause={togglePlayPause}
        onSpeedChange={changeSpeed}
        onReset={reset}
      />

      <EquipmentBar
        tank={{
          capacity: state.tank.capacity,
          waterLevel: state.resources.water,
        }}
        heater={{
          enabled: state.equipment.heater.enabled,
          targetTemperature: state.equipment.heater.targetTemperature,
          wattage: state.equipment.heater.wattage,
          isOn: state.equipment.heater.isOn,
        }}
        lid={{
          type: state.equipment.lid.type,
        }}
        ato={{
          enabled: state.equipment.ato.enabled,
        }}
        filter={{
          enabled: state.equipment.filter.enabled,
          type: state.equipment.filter.type,
        }}
        powerhead={{
          enabled: state.equipment.powerhead.enabled,
          flowRateGPH: state.equipment.powerhead.flowRateGPH,
        }}
        substrate={{
          type: state.equipment.substrate.type,
        }}
        hardscape={{
          items: state.equipment.hardscape.items,
        }}
        hardscapeSlots={state.tank.hardscapeSlots}
        light={{
          enabled: state.equipment.light.enabled,
          wattage: state.equipment.light.wattage,
          schedule: state.equipment.light.schedule,
        }}
        isLightOn={isLightOn}
        onTankCapacityChange={changeTankCapacity}
        onHeaterEnabledChange={updateHeaterEnabled}
        onHeaterTargetTemperatureChange={updateHeaterTargetTemperature}
        onHeaterWattageChange={updateHeaterWattage}
        onLidTypeChange={updateLidType}
        onAtoEnabledChange={updateAtoEnabled}
        onFilterEnabledChange={updateFilterEnabled}
        onFilterTypeChange={updateFilterType}
        onPowerheadEnabledChange={updatePowerheadEnabled}
        onPowerheadFlowRateChange={updatePowerheadFlowRate}
        onSubstrateTypeChange={updateSubstrateType}
        onHardscapeAddItem={addHardscapeItem}
        onHardscapeRemoveItem={removeHardscapeItem}
        onLightEnabledChange={updateLightEnabled}
        onLightWattageChange={updateLightWattage}
        onLightScheduleChange={updateLightSchedule}
      />

      <div className="p-4">
        {/* Responsive grid: 4 cols on desktop, 2 on tablet, 1 on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Column 1 */}
          <div className="space-y-4">
            <SimulationStatus
              tick={state.tick}
              speed={SPEED_MULTIPLIERS[speed]}
              isPlaying={isPlaying}
              onStep={step}
            />
            <Environment
              roomTemperature={state.environment.roomTemperature}
              waterTemperature={state.resources.temperature}
              onRoomTemperatureChange={updateRoomTemperature}
            />
            <Actions
              waterLevel={state.resources.water}
              capacity={state.tank.capacity}
              algae={state.resources.algae}
              tapWaterTemperature={state.environment.tapWaterTemperature}
              executeAction={executeAction}
              onTapWaterTemperatureChange={updateTapWaterTemperature}
            />
          </div>

          {/* Column 2 */}
          <div className="space-y-4">
            <Visualization
              waterLevel={state.resources.water}
              capacity={state.tank.capacity}
              waterTemperature={state.resources.temperature}
              roomTemperature={state.environment.roomTemperature}
              lidType={state.equipment.lid.type}
            />
            <ResourcesPanel
              surface={state.resources.surface}
              flow={state.resources.flow}
              light={state.resources.light}
              tankCapacity={state.tank.capacity}
            />
            <WaterChemistry
              waste={state.resources.waste}
              food={state.resources.food}
              temperature={state.resources.temperature}
              ambientWaste={state.environment.ambientWaste}
              ammonia={state.resources.ammonia}
              nitrite={state.resources.nitrite}
              nitrate={state.resources.nitrate}
              oxygen={state.resources.oxygen}
              co2={state.resources.co2}
              aob={state.resources.aob}
              nob={state.resources.nob}
              surface={state.resources.surface}
              water={state.resources.water}
            />
          </div>

          {/* Column 3 */}
          <div className="space-y-4">
            <Plants algae={state.resources.algae} />
          </div>

          {/* Column 4 */}
          <div className="space-y-4">
            <Livestock food={state.resources.food} />
          </div>
        </div>

        {/* Full width log */}
        <Log logs={state.logs} state={state} />
      </div>
    </div>
  );
}

export default App;
