import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import type { TunableConfig } from '../../../simulation/config/index.js';
import { countModified } from '../../../simulation/config/index.js';
import { verbLabel, withAmount, type VerbId } from '../../actions';
import { useActs } from '../../hooks/useActs';
import { useConfig } from '../../hooks/useConfig';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { PresetLoadProvider } from '../../hooks/usePresetLoad';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { type Need, activeNeeds, needySections } from '../../nav';
import { ActPalette } from '../actions/ActPalette';
import { VerbDrawer } from '../actions/VerbDrawer';
import { TunablesDrawer } from '../tunables/TunablesDrawer';
import { Drawer } from '../ui/Drawer';
import { IconRail, MoreSections, TabBar } from './IconRail';
import { Spine } from './Spine';
import { TopBar } from './TopBar';

/** What the shell has already worked out, for the module standing on the stage. */
export interface StageContext {
  needs: Need[];
  /**
   * Opens a verb's sheet, on the amount the surface asks for where it has one;
   * with no verb, the Act palette.
   */
  onAct: (verb?: VerbId, at?: number) => void;
  /** The verb and the amount it is standing on, or the one asked for here. */
  actLabel: (verb: VerbId, at?: number) => string;
}

export function useStage(): StageContext {
  return useOutletContext<StageContext>();
}

interface AppShellProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}

/**
 * Top bar, fixed rail, stage, spine — four bands that never move, with the one
 * drawer laying over the stage, so a module page and its inspector are never
 * fighting for the same width.
 */
export function AppShell({ sim, config }: AppShellProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const { unitSystem } = useUnits();
  const { tunablesOpen, setTunablesOpen } = useConfig();
  const [more, setMore] = useState(false);
  const acts = useActs(sim.executeAction);

  const needs = useMemo(() => activeNeeds(sim.state), [sim.state]);
  const alerts = useMemo(() => needySections(needs), [needs]);
  const tunablesModified = useMemo(() => countModified(config), [config]);

  const { openPalette, open } = acts;

  const onAct = useCallback(
    (verb?: VerbId, at?: number) => {
      setTunablesOpen(false);
      setMore(false);
      if (verb === undefined) openPalette();
      else open(verb, at);
    },
    [open, openPalette, setTunablesOpen]
  );

  const actLabel = useCallback(
    (verb: VerbId, at?: number) =>
      verbLabel(sim.state, verb, withAmount(acts.settings, verb, at), unitSystem),
    [sim.state, acts.settings, unitSystem]
  );

  const stage = useMemo<StageContext>(
    () => ({ needs, onAct, actLabel }),
    [needs, onAct, actLabel]
  );

  const openMore = useCallback(() => {
    acts.close();
    setTunablesOpen(false);
    setMore((was) => !was);
  }, [acts, setTunablesOpen]);

  const toggleTunables = useCallback(() => {
    acts.close();
    setMore(false);
    setTunablesOpen(!tunablesOpen);
  }, [acts, tunablesOpen, setTunablesOpen]);

  const closeDrawers = useCallback(() => {
    acts.close();
    setMore(false);
    setTunablesOpen(false);
  }, [acts, setTunablesOpen]);

  // A sheet left open across a resize would outlive the tab bar that opened it.
  useEffect(() => {
    if (!isMobile) setMore(false);
  }, [isMobile]);

  const shortcuts = useMemo(
    () => ({
      Space: (): void => (sim.isPlaying ? sim.togglePlayPause() : sim.step()),
      '⌘k': (): void => onAct(),
      '⌘,': toggleTunables,
    }),
    [sim.isPlaying, sim.togglePlayPause, sim.step, onAct, toggleTunables]
  );
  useKeyboardShortcuts(shortcuts);

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
          needs={needs}
          actOpen={acts.palette}
          actLabel={acts.promoted === null ? null : actLabel(acts.promoted)}
          onAct={() => onAct()}
          tunablesOpen={tunablesOpen}
          tunablesModified={tunablesModified}
          onTunables={toggleTunables}
        />

        <div className="flex min-h-0 flex-1">
          {!isMobile && <IconRail alerts={alerts} />}

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet context={stage} />

            {acts.palette && (
              <ActPalette
                state={sim.state}
                settings={acts.settings}
                onPick={(verb) => onAct(verb)}
                onClose={closeDrawers}
              />
            )}

            <VerbDrawer
              verb={acts.verb}
              state={sim.state}
              config={config}
              settings={acts.settings}
              onAmount={acts.setAmount}
              onCommit={acts.commit}
              onClose={closeDrawers}
            />

            <Drawer open={more} onClose={closeDrawers} title="More">
              <MoreSections alerts={alerts} onNavigate={closeDrawers} />
            </Drawer>

            <TunablesDrawer open={tunablesOpen} onClose={closeDrawers} />
          </main>
        </div>

        {isMobile && (
          <TabBar alerts={alerts} moreOpen={more} onMore={openMore} />
        )}

        <footer aria-label="Run timeline" className="shrink-0">
          <Spine history={sim.history} logs={sim.state.logs} />
        </footer>
      </div>
    </PresetLoadProvider>
  );
}
