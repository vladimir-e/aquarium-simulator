import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewSection } from './sections/OverviewSection';
import { WaterSection } from './sections/WaterSection';
import { GearSection } from './sections/GearSection';
import { LifeSection } from './sections/LifeSection';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { ScenarioSection } from './sections/ScenarioSection';
import { useSimulation } from './hooks/useSimulation';
import { useConfig } from './hooks/useConfig';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App(): React.JSX.Element {
  const sim = useSimulation();
  const { config } = useConfig();

  useKeyboardShortcuts(sim.step, sim.togglePlayPause, sim.isPlaying);

  return (
    <Routes>
      <Route element={<AppShell sim={sim} config={config} />}>
        <Route index element={<OverviewSection sim={sim} config={config} />} />
        <Route path="water" element={<WaterSection sim={sim} config={config} />} />
        <Route path="life" element={<LifeSection sim={sim} config={config} />} />
        <Route path="gear/:deviceId?" element={<GearSection sim={sim} config={config} />} />
        <Route path="history" element={<AnalyticsSection sim={sim} />} />
        <Route path="setup" element={<ScenarioSection sim={sim} config={config} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
