import React from 'react';
import { BookOpen, Github, Pause, Play, SkipForward, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRESETS, type PresetId } from '../../../simulation/presets.js';
import { usePresetLoad } from '../../hooks/usePresetLoad';
import { SPEED_LABELS, SPEED_PRESETS, type SpeedPreset } from '../../run';
import { formatDayClock } from '../../utils/clock';
import { DRAWER_TOGGLE } from '../ui/Drawer';
import { Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { ThemeToggle } from '../ui/ThemeToggle';

const REPO_URL = 'https://github.com/vladimir-e/aquarium-simulator';
const DOCS_URL = 'https://docs.fishroom.app';

const SPEED_OPTIONS = SPEED_PRESETS.map((preset) => ({
  value: preset,
  label: SPEED_LABELS[preset],
}));

const CONTROL =
  'flex h-8 items-center gap-1.5 rounded-control border border-hairline px-2 text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const ICON = `${CONTROL} w-8 justify-center px-0 text-ink-2 hover:text-ink`;

function Badge({ count, tone }: { count: number; tone: 'accent' | 'alert' }): React.JSX.Element {
  return (
    <span
      className={`min-w-4 rounded-full px-1.5 text-center text-[11px] font-medium leading-4 tabular-nums text-accent-ink ${
        tone === 'alert' ? 'bg-alert' : 'bg-accent'
      }`}
    >
      {count}
    </span>
  );
}

interface TopBarProps {
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  onPlayPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
  needsCount: number;
  actOpen: boolean;
  onAct: () => void;
  tunablesOpen: boolean;
  tunablesModified: number;
  onTunables: () => void;
}

/**
 * The one place the run is driven from. The transport sits centre because it
 * is touched every session and should be where the thumb left it; nothing here
 * carries a live figure except the clock and the count of what needs the
 * keeper.
 */
export function TopBar({
  tick,
  isPlaying,
  speed,
  onPlayPause,
  onStep,
  onSpeedChange,
  needsCount,
  actOpen,
  onAct,
  tunablesOpen,
  tunablesModified,
  onTunables,
}: TopBarProps): React.JSX.Element {
  const { current, request } = usePresetLoad();

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hairline px-2">
      <Select
        ariaLabel="Tank preset"
        value={current}
        onChange={(v) => request(v as PresetId)}
        options={PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
        className="w-[10rem] max-md:w-[7.5rem]"
        selectClassName="h-8 truncate border-transparent hover:border-hairline"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={ICON}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onStep} className={`${CONTROL} max-md:hidden`}>
          <SkipForward className="h-3.5 w-3.5 text-ink-2" />
          +1 d
        </button>

        <p className="px-1.5 text-[15px] tabular-nums max-md:px-0">
          {formatDayClock(tick)}
          <span className="ml-2 text-[13px] text-ink-2 max-lg:hidden">tick {tick}</span>
        </p>

        <Segmented
          ariaLabel="Speed"
          options={SPEED_OPTIONS}
          value={speed}
          onChange={onSpeedChange}
          className="h-8 max-md:hidden"
        />
      </div>

      <div className="flex items-center justify-end gap-1.5">
        {needsCount > 0 && (
          <Link to="/" className={`${CONTROL} text-warn`} aria-label={`${needsCount} needs you`}>
            <TriangleAlert className="h-3.5 w-3.5" />
            <span className="max-lg:hidden">Needs you</span>
            <Badge count={needsCount} tone="alert" />
          </Link>
        )}
        <button
          type="button"
          onClick={onAct}
          aria-expanded={actOpen}
          className={`${CONTROL} border-transparent bg-accent-tint font-medium text-accent`}
          {...DRAWER_TOGGLE}
        >
          Act
          <span className="text-ink-3 max-lg:hidden">⌘K</span>
        </button>
        <button
          type="button"
          onClick={onTunables}
          aria-label="Tunables"
          aria-expanded={tunablesOpen}
          className={`${ICON} ${tunablesModified > 0 ? 'w-auto gap-1 px-2' : ''} max-md:hidden`}
          {...DRAWER_TOGGLE}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {tunablesModified > 0 && <Badge count={tunablesModified} tone="accent" />}
        </button>
        <ThemeToggle />
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Documentation"
          className={`${ICON} max-md:hidden`}
        >
          <BookOpen className="h-4 w-4" />
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          className={`${ICON} max-md:hidden`}
        >
          <Github className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}
