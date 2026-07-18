import React from 'react';
import { EquipmentBar } from '../components/layout/EquipmentBar';
import { ResourcesPanel } from '../components/resources/ResourcesPanel';
import { SimulationStatus } from '../components/panels/SimulationStatus';
import { Environment } from '../components/panels/Environment';
import { Actions } from '../components/panels/Actions';
import { Visualization } from '../components/panels/Visualization';
import { WaterChemistry } from '../components/panels/WaterChemistry';
import { Plants } from '../components/panels/Plants';
import { Nutrients } from '../components/panels/Nutrients';
import { Livestock } from '../components/panels/Livestock';
import { Log } from '../components/panels/Log';
import type { useSimulation } from '../hooks/useSimulation';
import type { TunableConfig } from '../../simulation/config/index.js';
import { SPEED_TICKS_PER_SECOND } from '../run/speed';

interface RunModeProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}

export function RunMode({ sim, config }: RunModeProps): React.JSX.Element {
  const { state } = sim;
  const isLightOn = state.resources.light > 0;

  return (
    <div className="p-4">
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
        airPump={{
          enabled: state.equipment.airPump.enabled,
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
        co2Generator={{
          enabled: state.equipment.co2Generator.enabled,
          bubbleRate: state.equipment.co2Generator.bubbleRate,
          isOn: state.equipment.co2Generator.isOn,
          schedule: state.equipment.co2Generator.schedule,
        }}
        autoDoser={{
          enabled: state.equipment.autoDoser.enabled,
          doseAmountMl: state.equipment.autoDoser.doseAmountMl,
          schedule: state.equipment.autoDoser.schedule,
          dosedToday: state.equipment.autoDoser.dosedToday,
        }}
        onTankCapacityChange={sim.changeTankCapacity}
        onHeaterEnabledChange={sim.updateHeaterEnabled}
        onHeaterTargetTemperatureChange={sim.updateHeaterTargetTemperature}
        onHeaterWattageChange={sim.updateHeaterWattage}
        onLidTypeChange={sim.updateLidType}
        onAtoEnabledChange={sim.updateAtoEnabled}
        onFilterEnabledChange={sim.updateFilterEnabled}
        onFilterTypeChange={sim.updateFilterType}
        onAirPumpEnabledChange={sim.updateAirPumpEnabled}
        onPowerheadEnabledChange={sim.updatePowerheadEnabled}
        onPowerheadFlowRateChange={sim.updatePowerheadFlowRate}
        onSubstrateTypeChange={sim.updateSubstrateType}
        onHardscapeAddItem={sim.addHardscapeItem}
        onHardscapeRemoveItem={sim.removeHardscapeItem}
        onLightEnabledChange={sim.updateLightEnabled}
        onLightWattageChange={sim.updateLightWattage}
        onLightScheduleChange={sim.updateLightSchedule}
        onCo2GeneratorEnabledChange={sim.updateCo2GeneratorEnabled}
        onCo2GeneratorBubbleRateChange={sim.updateCo2GeneratorBubbleRate}
        onCo2GeneratorScheduleChange={sim.updateCo2GeneratorSchedule}
        onAutoDoserEnabledChange={sim.updateAutoDoserEnabled}
        onAutoDoserAmountChange={sim.updateAutoDoserAmount}
        onAutoDoserScheduleChange={sim.updateAutoDoserSchedule}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
        <div className="space-y-4">
          <SimulationStatus
            tick={state.tick}
            speed={SPEED_TICKS_PER_SECOND[sim.speed]}
            isPlaying={sim.isPlaying}
            currentPreset={sim.currentPreset}
            isPresetModified={sim.isPresetModified}
            onStep={sim.step}
            onPresetChange={sim.loadPreset}
          />
          <Environment
            roomTemperature={state.environment.roomTemperature}
            waterTemperature={state.resources.temperature}
            onRoomTemperatureChange={sim.updateRoomTemperature}
          />
          <Actions
            waterLevel={state.resources.water}
            capacity={state.tank.capacity}
            algaeMass={state.algae.mass}
            plants={state.plants}
            tapWaterTemperature={state.environment.tapWaterTemperature}
            tapWaterPH={state.environment.tapWaterPH}
            executeAction={sim.executeAction}
            onTapWaterTemperatureChange={sim.updateTapWaterTemperature}
            onTapWaterPHChange={sim.updateTapWaterPH}
          />
        </div>

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
            ammonia={state.resources.ammonia}
            nitrite={state.resources.nitrite}
            nitrate={state.resources.nitrate}
            oxygen={state.resources.oxygen}
            co2={state.resources.co2}
            ph={state.resources.ph}
            aob={state.resources.aob}
            nob={state.resources.nob}
            surface={state.resources.surface}
            water={state.resources.water}
          />
        </div>

        <div className="space-y-4">
          <Plants
            algae={state.algae}
            plants={state.plants}
            resources={state.resources}
            tankCapacity={state.tank.capacity}
            substrateType={state.equipment.substrate.type}
            plantsConfig={config.plants}
            algaeConfig={config.algae}
            nutrientsConfig={config.nutrients}
            executeAction={sim.executeAction}
          />
          <Nutrients
            nitrate={state.resources.nitrate}
            phosphate={state.resources.phosphate}
            potassium={state.resources.potassium}
            iron={state.resources.iron}
            waterVolume={state.resources.water}
          />
        </div>

        <div className="space-y-4">
          <Livestock
            food={state.resources.food}
            fish={state.fish}
            clutches={state.clutches}
            plants={state.plants}
            resources={state.resources}
            tankCapacity={state.tank.capacity}
            tick={state.tick}
            livestockConfig={config.livestock}
            executeAction={sim.executeAction}
          />
        </div>
      </div>

      <Log logs={state.logs} state={state} />
    </div>
  );
}
