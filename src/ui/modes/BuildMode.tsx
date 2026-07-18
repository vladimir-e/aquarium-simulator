import React from 'react';
import { EquipmentBar } from '../components/layout/EquipmentBar';
import { Environment } from '../components/panels/Environment';
import { SimulationStatus } from '../components/panels/SimulationStatus';
import type { useSimulation } from '../hooks/useSimulation';
import { SPEED_TICKS_PER_SECOND } from '../run/speed';

interface BuildModeProps {
  sim: ReturnType<typeof useSimulation>;
  /** Device id carried in from a Systems row tap in Run, or null. */
  selectedDeviceId: string | null;
}

/**
 * Placeholder for the Build unit. It rehomes the equipment bar, room
 * environment, and simulation status that Run used to host, so nothing is lost
 * mid-redesign; the Build unit replaces this with the real master/detail
 * configurator and consumes `selectedDeviceId` to open the tapped device.
 */
export function BuildMode({ sim, selectedDeviceId }: BuildModeProps): React.JSX.Element {
  const { state } = sim;

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-card border border-hairline bg-surface px-4 py-3 text-[13px] text-ink-2">
        Build is a placeholder in this redesign. Equipment, environment, and status
        live here for now.
        {selectedDeviceId && (
          <span className="ml-2 text-ink">
            Selected device: <span className="font-medium">{selectedDeviceId}</span>
          </span>
        )}
      </div>

      <EquipmentBar
        tank={{ capacity: state.tank.capacity, waterLevel: state.resources.water }}
        heater={{
          enabled: state.equipment.heater.enabled,
          targetTemperature: state.equipment.heater.targetTemperature,
          wattage: state.equipment.heater.wattage,
          isOn: state.equipment.heater.isOn,
        }}
        lid={{ type: state.equipment.lid.type }}
        ato={{ enabled: state.equipment.ato.enabled }}
        filter={{ enabled: state.equipment.filter.enabled, type: state.equipment.filter.type }}
        airPump={{ enabled: state.equipment.airPump.enabled }}
        powerhead={{
          enabled: state.equipment.powerhead.enabled,
          flowRateGPH: state.equipment.powerhead.flowRateGPH,
        }}
        substrate={{ type: state.equipment.substrate.type }}
        hardscape={{ items: state.equipment.hardscape.items }}
        hardscapeSlots={state.tank.hardscapeSlots}
        light={{
          enabled: state.equipment.light.enabled,
          wattage: state.equipment.light.wattage,
          schedule: state.equipment.light.schedule,
        }}
        isLightOn={state.resources.light > 0}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
      </div>
    </div>
  );
}
