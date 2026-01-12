import { Timeline, EquipmentBar } from './components/layout';
import {
  TankPresetPanel,
  TankSizePanel,
  EnvironmentPanel,
  ScheduledPanel,
  ActionsPanel,
  VisualizationPanel,
  WaterChemistryPanel,
  PlantsPanel,
  LivestockPanel,
  LogPanel,
} from './components/panels';
import { useSimulation, useKeyboardShortcuts } from './hooks';

export default function App() {
  const {
    state,
    isPlaying,
    speed,
    stepMultiple,
    togglePlay,
    setSpeed,
    setRoomTemperature,
    setHeaterEnabled,
    setHeaterTargetTemp,
    setHeaterWattage,
    setTankCapacity,
  } = useSimulation();

  // Keyboard shortcuts (Space to step, P to toggle play)
  useKeyboardShortcuts({
    onStep: () => stepMultiple(6),
    onTogglePlay: togglePlay,
    isPlaying,
  });

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Timeline - sticky at top */}
      <Timeline
        tick={state.tick}
        isPlaying={isPlaying}
        speed={speed}
        onStep={() => stepMultiple(6)}
        onTogglePlay={togglePlay}
        onSpeedChange={setSpeed}
      />

      {/* Equipment Bar - sticky below timeline */}
      <EquipmentBar
        equipment={state.equipment}
        onHeaterEnabledChange={setHeaterEnabled}
        onHeaterTargetTempChange={setHeaterTargetTemp}
        onHeaterWattageChange={setHeaterWattage}
      />

      {/* Main content area */}
      <main className="p-4">
        {/* 4-column responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Tank settings & Actions */}
          <div className="space-y-4">
            <TankPresetPanel />
            <TankSizePanel
              capacity={state.tank.capacity}
              onCapacityChange={setTankCapacity}
            />
            <EnvironmentPanel
              roomTemperature={state.environment.roomTemperature}
              waterTemperature={state.resources.temperature}
              onRoomTemperatureChange={setRoomTemperature}
            />
            <ScheduledPanel />
            <ActionsPanel />
          </div>

          {/* Column 2: Visualization & Chemistry */}
          <div className="space-y-4">
            <VisualizationPanel
              waterLevel={state.tank.waterLevel}
              capacity={state.tank.capacity}
            />
            <WaterChemistryPanel />
          </div>

          {/* Column 3: Plants */}
          <div className="space-y-4">
            <PlantsPanel />
          </div>

          {/* Column 4: Livestock */}
          <div className="space-y-4">
            <LivestockPanel />
          </div>
        </div>

        {/* Full-width Log panel */}
        <div className="mt-4">
          <LogPanel />
        </div>
      </main>
    </div>
  );
}
