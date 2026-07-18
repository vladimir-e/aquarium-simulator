import React, { useState } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { DebugPanel } from './components/panels/DebugPanel';
import { RunMode } from './modes/RunMode';
import { BuildMode } from './modes/BuildMode';
import { ReviewMode } from './modes/ReviewMode';
import type { Mode } from './modes/types';
import { useSimulation } from './hooks/useSimulation';
import { useConfig } from './hooks/useConfig';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App(): React.JSX.Element {
  const sim = useSimulation();
  const { config } = useConfig();
  const [mode, setMode] = useState<Mode>('run');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useKeyboardShortcuts(sim.step, sim.togglePlayPause, sim.isPlaying);

  const handleModeChange = (next: Mode): void => {
    // Entering Build pauses the sim; leaving it does not auto-resume.
    if (next === 'build') sim.pause();
    else setSelectedDeviceId(null);
    setMode(next);
  };

  const handleOpenDeviceInBuild = (deviceId: string): void => {
    setSelectedDeviceId(deviceId);
    handleModeChange('build');
  };

  const handleResumeRun = (): void => {
    setSelectedDeviceId(null);
    setMode('run');
    if (!sim.isPlaying) sim.togglePlayPause();
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <AppHeader
        mode={mode}
        onModeChange={handleModeChange}
        currentPreset={sim.currentPreset}
        onPresetChange={sim.loadPreset}
        isPlaying={sim.isPlaying}
        onPlayPause={sim.togglePlayPause}
        onStep={sim.step}
        tick={sim.state.tick}
        speed={sim.speed}
        onSpeedChange={sim.changeSpeed}
      />

      <main>
        {mode === 'run' && (
          <RunMode sim={sim} config={config} onOpenDeviceInBuild={handleOpenDeviceInBuild} />
        )}
        {mode === 'build' && (
          <BuildMode
            sim={sim}
            config={config}
            selectedDeviceId={selectedDeviceId}
            onResumeRun={handleResumeRun}
          />
        )}
        {mode === 'review' && <ReviewMode sim={sim} />}
      </main>

      <DebugPanel />
    </div>
  );
}

export default App;
