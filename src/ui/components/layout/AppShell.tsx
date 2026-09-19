import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { TunableConfig } from '../../../simulation/config/index.js';
import { DEFAULT_CONFIG, isModified } from '../../../simulation/config/index.js';
import { useConfig } from '../../hooks/useConfig';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { PresetLoadProvider } from '../../hooks/usePresetLoad';
import type { useSimulation } from '../../hooks/useSimulation';
import { activeNeeds, needySections } from '../../nav';
import { DebugPanel } from '../panels/DebugPanel';
import { Drawer } from '../ui/Drawer';
import { IconRail, MoreSections, TabBar } from './IconRail';
import { Spine } from './Spine';
import { TopBar } from './TopBar';

function modifiedTunables(config: TunableConfig): number {
  return (Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[]).reduce(
    (count, section) =>
      count +
      Object.keys(DEFAULT_CONFIG[section]).filter((key) =>
        isModified(config, section, key as keyof TunableConfig[typeof section])
      ).length,
    0
  );
}

interface AppShellProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}

/**
 * Top bar, fixed rail, stage, spine — four bands that never move. Everything
 * that inspects lays over the stage in the one drawer, so a module page and
 * its inspector are never fighting for the same width.
 */
export function AppShell({ sim, config }: AppShellProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const { isDebugPanelOpen, setDebugPanelOpen } = useConfig();
  const [drawer, setDrawer] = useState<'act' | 'more' | null>(null);
  const [parked, setParked] = useState<number | null>(null);

  const needs = useMemo(() => activeNeeds(sim.state), [sim.state]);
  const alerts = useMemo(() => needySections(needs), [needs]);

  const openDrawer = useCallback(
    (kind: 'act' | 'more') => {
      setDebugPanelOpen(false);
      setDrawer((open) => (open === kind ? null : kind));
    },
    [setDebugPanelOpen]
  );

  const toggleTunables = useCallback(() => {
    setDrawer(null);
    setDebugPanelOpen(!isDebugPanelOpen);
  }, [isDebugPanelOpen, setDebugPanelOpen]);

  const closeDrawers = useCallback(() => {
    setDrawer(null);
    setDebugPanelOpen(false);
  }, [setDebugPanelOpen]);

  // A sheet left open across a resize would outlive the tab bar that opened it.
  useEffect(() => {
    if (!isMobile) setDrawer((open) => (open === 'more' ? null : open));
  }, [isMobile]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'k') {
        e.preventDefault();
        openDrawer('act');
      } else if (e.key === ',') {
        e.preventDefault();
        toggleTunables();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [openDrawer, toggleTunables]);

  return (
    <PresetLoadProvider current={sim.currentPreset} state={sim.state} onLoad={sim.loadPreset}>
      <div className="flex h-dvh flex-col bg-bg text-ink">
        <TopBar
          tick={sim.state.tick}
          isPlaying={sim.isPlaying}
          speed={sim.speed}
          onPlayPause={sim.togglePlayPause}
          onStep={sim.step}
          onSpeedChange={sim.changeSpeed}
          needsCount={needs.length}
          actOpen={drawer === 'act'}
          onAct={() => openDrawer('act')}
          tunablesOpen={isDebugPanelOpen}
          tunablesModified={modifiedTunables(config)}
          onTunables={toggleTunables}
        />

        <div className="flex min-h-0 flex-1">
          {!isMobile && <IconRail alerts={alerts} />}

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />

            <Drawer open={drawer === 'act'} onClose={closeDrawers} title="Act">
              <p className="p-3 text-[13px] text-ink-2">No verbs wired up yet.</p>
            </Drawer>

            <Drawer open={drawer === 'more'} onClose={closeDrawers} title="More">
              <MoreSections alerts={alerts} onNavigate={closeDrawers} />
            </Drawer>

            <Drawer open={isDebugPanelOpen} onClose={closeDrawers} title="Tunables">
              <DebugPanel />
            </Drawer>
          </main>
        </div>

        {isMobile && (
          <TabBar alerts={alerts} moreOpen={drawer === 'more'} onMore={() => openDrawer('more')} />
        )}

        <Spine
          history={sim.history}
          logs={sim.state.logs}
          tick={sim.state.tick}
          parked={parked}
          onScrub={setParked}
        />
      </div>
    </PresetLoadProvider>
  );
}
