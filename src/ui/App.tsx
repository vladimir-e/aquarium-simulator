import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewSection } from './sections/OverviewSection';
import { WaterSection } from './sections/WaterSection';
import { EquipmentSection } from './sections/EquipmentSection';
import { FloraSection } from './sections/FloraSection';
import { LivestockSection } from './sections/LivestockSection';
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
        <Route index element={<OverviewSection />} />
        <Route path="water" element={<WaterSection sim={sim} config={config} />} />
        <Route
          path="life"
          element={
            <>
              <FloraSection sim={sim} config={config} />
              <LivestockSection sim={sim} config={config} />
            </>
          }
        />
        <Route path="gear/:deviceId?" element={<EquipmentSection sim={sim} config={config} />} />
        <Route path="history" element={<AnalyticsSection sim={sim} />} />
        <Route path="setup" element={<ScenarioSection sim={sim} config={config} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
