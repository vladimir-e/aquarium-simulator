import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewSection } from './sections/OverviewSection';
import { WaterSection } from './sections/WaterSection';
import { GearSection } from './sections/GearSection';
import { LifeSection } from './sections/LifeSection';
import { HistorySection } from './sections/HistorySection';
import { SetupSection } from './sections/SetupSection';
import { useSimulation } from './hooks/useSimulation';
import { useConfig } from './hooks/useConfig';

function App(): React.JSX.Element {
  const sim = useSimulation();
  const { config } = useConfig();

  return (
    <Routes>
      <Route element={<AppShell sim={sim} config={config} />}>
        <Route index element={<OverviewSection sim={sim} config={config} />} />
        <Route path="water" element={<WaterSection sim={sim} config={config} />} />
        <Route path="life" element={<LifeSection sim={sim} config={config} />} />
        <Route path="gear/:deviceId?" element={<GearSection sim={sim} config={config} />} />
        <Route path="history" element={<HistorySection sim={sim} />} />
        <Route path="setup" element={<SetupSection sim={sim} config={config} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
