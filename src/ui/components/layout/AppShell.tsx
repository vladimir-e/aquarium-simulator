import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMediaQuery, RAIL_QUERY } from '../../hooks/useMediaQuery';
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
  const railStands = useMediaQuery(RAIL_QUERY);
  const [indexOpen, setIndexOpen] = useState(false);
  const openIndex = useCallback(() => setIndexOpen(true), []);
  const closeIndex = useCallback(() => setIndexOpen(false), []);
  const drawerRef = useFocusTrap(indexOpen);

  // A drawer left open across a resize would mount the rail twice.
  useEffect(() => {
    if (railStands) setIndexOpen(false);
  }, [railStands]);

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
    aggregates: sim.aggregates,
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
        onOpenIndex={railStands ? null : openIndex}
      />

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {railStands && rail}
        <Outlet />
      </div>

      {indexOpen && (
        <div className="fixed inset-0 z-40">
          <div aria-hidden onClick={closeIndex} className="absolute inset-0 bg-ink/30" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Index"
            className="absolute inset-y-0 left-0 flex flex-col gap-3 border-r border-hairline-2 bg-surface p-3 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close index"
              onClick={closeIndex}
              className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-control border border-hairline text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X className="h-4 w-4" />
            </button>
            {rail}
          </div>
        </div>
      )}

      <DebugPanel />
    </div>
  );
}
