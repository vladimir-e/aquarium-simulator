import React, { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { navFigures } from '../../nav';
import { getPresetById } from '../../presets.js';
import { DebugPanel } from '../panels/DebugPanel';
import { ChromeRow } from './ChromeRow';
import { IndexRail } from './IndexRail';

interface AppShellProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}

/**
 * Chrome row over index rail plus stage. Below `md` the rail has nowhere to
 * stand, so it becomes a drawer — component state, never a route, or the back
 * gesture would close the drawer instead of changing section.
 */
export function AppShell({ sim, config }: AppShellProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const [indexOpen, setIndexOpen] = useState(false);
  const closeIndex = useCallback(() => setIndexOpen(false), []);

  useEffect(() => {
    if (!indexOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIndexOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [indexOpen]);

  const figures = navFigures({
    state: sim.state,
    config,
    presetName: getPresetById(sim.currentPreset)?.name ?? sim.currentPreset,
    units: unitSystem,
    alerts: sim.aggregates.alerts,
    deaths: sim.aggregates.deaths,
    births: sim.aggregates.births,
  });

  const rail = (
    <IndexRail
      figures={figures}
      tick={sim.state.tick}
      isPlaying={sim.isPlaying}
      speed={sim.speed}
      lightSchedule={sim.state.equipment.light.schedule}
      lightOn={sim.state.equipment.light.enabled}
      onPlayPause={sim.togglePlayPause}
      onStep={sim.step}
      onSpeedChange={sim.changeSpeed}
      onNavigate={closeIndex}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <ChromeRow
        logs={sim.state.logs}
        currentPreset={sim.currentPreset}
        onPresetChange={sim.loadPreset}
        onOpenIndex={() => setIndexOpen(true)}
      />

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="hidden min-h-0 md:flex">{rail}</div>
        <Outlet />
      </div>

      {indexOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close index"
            onClick={closeIndex}
            className="absolute inset-0 bg-ink/30"
          />
          <div className="absolute inset-y-0 left-0 flex flex-col border-r border-hairline-2 bg-surface p-3 shadow-2xl">
            {rail}
          </div>
        </div>
      )}

      <DebugPanel />
    </div>
  );
}
