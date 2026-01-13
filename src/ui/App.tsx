import React from 'react';
import { Timeline } from './components/layout/Timeline';
import { EquipmentBar } from './components/layout/EquipmentBar';
import { TankPreset } from './components/panels/TankPreset';
import { TankSize } from './components/panels/TankSize';
import { Environment } from './components/panels/Environment';
import { Scheduled } from './components/panels/Scheduled';
import { Actions } from './components/panels/Actions';
import { Visualization } from './components/panels/Visualization';
import { WaterChemistry } from './components/panels/WaterChemistry';
import { Plants } from './components/panels/Plants';
import { Livestock } from './components/panels/Livestock';
import { Log } from './components/panels/Log';
import { useSimulation } from './hooks/useSimulation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

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
    changeTankCapacity,
    reset,
  } = useSimulation();

  useKeyboardShortcuts(step, togglePlayPause, isPlaying);

  return (
    <div className="min-h-screen bg-background text-gray-200">
      <Timeline
        tick={state.tick}
        isPlaying={isPlaying}
        speed={speed}
        onStep={step}
        onPlayPause={togglePlayPause}
        onSpeedChange={changeSpeed}
        onReset={reset}
      />

      <EquipmentBar
        heater={{
          enabled: state.equipment.heater.enabled,
          targetTemperature: state.equipment.heater.targetTemperature,
          wattage: state.equipment.heater.wattage,
          isOn: state.equipment.heater.isOn,
        }}
        onHeaterEnabledChange={updateHeaterEnabled}
        onHeaterTargetTemperatureChange={updateHeaterTargetTemperature}
        onHeaterWattageChange={updateHeaterWattage}
      />

      <div className="p-4">
        {/* Responsive grid: 4 cols on desktop, 2 on tablet, 1 on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Column 1 */}
          <div className="space-y-4">
            <TankPreset />
            <TankSize
              capacity={state.tank.capacity}
              onCapacityChange={changeTankCapacity}
            />
            <Environment
              roomTemperature={state.environment.roomTemperature}
              waterTemperature={state.resources.temperature}
              onRoomTemperatureChange={updateRoomTemperature}
            />
            <Scheduled />
            <Actions />
          </div>

          {/* Column 2 */}
          <div className="space-y-4">
            <Visualization
              waterLevel={state.tank.waterLevel}
              capacity={state.tank.capacity}
            />
            <WaterChemistry />
          </div>

          {/* Column 3 */}
          <div className="space-y-4">
            <Plants />
          </div>

          {/* Column 4 */}
          <div className="space-y-4">
            <Livestock />
          </div>
        </div>

        {/* Full width log */}
        <Log logs={state.logs} state={state} />
      </div>
    </div>
  );
}

export default App;
