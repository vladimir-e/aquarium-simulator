import React from 'react';
import { Play, Pause, SkipForward, Settings, ChevronDown } from 'lucide-react';
import { Segmented } from '../ui/Segmented';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useConfig } from '../../hooks/useConfig';
import { PRESETS, type PresetId } from '../../presets.js';
import {
  type SpeedPreset,
  SPEED_PRESETS,
  SPEED_LABELS,
  STEP_LABELS,
} from '../../run/speed';
import type { Mode } from '../../modes/types';

const MODE_OPTIONS = [
  { value: 'build' as const, label: 'Build' },
  { value: 'run' as const, label: 'Run' },
  { value: 'review' as const, label: 'Review' },
];

const SPEED_OPTIONS = SPEED_PRESETS.map((preset) => ({
  value: preset,
  label: SPEED_LABELS[preset],
}));

interface AppHeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  currentPreset: PresetId;
  onPresetChange: (id: PresetId) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  tick: number;
  speed: SpeedPreset;
  onSpeedChange: (speed: SpeedPreset) => void;
}

function Clock({ tick }: { tick: number }): React.JSX.Element {
  const day = Math.floor(tick / 24) + 1;
  const hour = String(tick % 24).padStart(2, '0');
  return (
    <div className="shrink-0 font-mono text-[13px] tabular-nums text-ink" aria-label={`Day ${day}, ${hour}:00`}>
      <span className="hidden sm:inline">Day </span>
      <span className="sm:hidden">D</span>
      {day} · {hour}:00
    </div>
  );
}

export function AppHeader({
  mode,
  onModeChange,
  currentPreset,
  onPresetChange,
  isPlaying,
  onPlayPause,
  onStep,
  tick,
  speed,
  onSpeedChange,
}: AppHeaderProps): React.JSX.Element {
  const { isDebugPanelOpen, toggleDebugPanel, isAnyModified } = useConfig();

  return (
    <header className="sticky top-0 z-30 border-b border-hairline-2 bg-surface px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-2 max-sm:justify-between sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
        {/* Left: wordmark + engine label + preset */}
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="text-[17px] font-semibold tracking-[0.04em] text-accent">AQ·SIM</span>
            <span className="hidden text-[11px] font-medium tracking-[0.06em] text-ink-3 sm:inline">
              CHEMISTRY ENGINE v4
            </span>
          </div>
          <div className="relative">
            <select
              value={currentPreset}
              onChange={(e) => onPresetChange(e.target.value as PresetId)}
              aria-label="Scenario preset"
              className="w-full max-w-[8.5rem] appearance-none truncate rounded-control border border-hairline bg-surface py-1.5 pl-3 pr-8 text-[13px] font-medium text-ink transition-colors hover:border-hairline-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:max-w-none"
            >
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          </div>
          {mode === 'build' && (
            <button
              type="button"
              disabled
              aria-disabled
              title="Coming with saved scenarios"
              className="hidden cursor-not-allowed items-center gap-1 rounded-control px-2.5 py-1.5 text-[13px] font-medium text-ink-3 opacity-60 sm:inline-flex"
            >
              save
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Center: mode switcher (bottom tab bar replaces it below sm) */}
        <div className="hidden justify-self-center sm:block">
          <Segmented ariaLabel="Mode" options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
        </div>

        {/* Right: transport + theme + utilities */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-end sm:gap-2">
          {(mode === 'run' || mode === 'review') && (
            <>
              <button
                type="button"
                onClick={onPlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus max-sm:after:absolute max-sm:after:inset-[-6px] max-sm:after:content-['']"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onStep}
                className="hidden shrink-0 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:inline-flex"
              >
                <SkipForward className="h-3.5 w-3.5" />
                Step {STEP_LABELS[speed]}
              </button>
              <Clock tick={tick} />
              <div className="relative shrink-0 sm:hidden">
                <select
                  value={speed}
                  onChange={(e) => onSpeedChange(e.target.value as SpeedPreset)}
                  aria-label="Speed"
                  className="min-h-[44px] appearance-none rounded-control border border-hairline bg-surface py-1.5 pl-2.5 pr-7 text-[13px] font-medium text-ink transition-colors hover:border-hairline-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {SPEED_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
              </div>
              <div className="hidden shrink-0 sm:block">
                <Segmented ariaLabel="Speed" options={SPEED_OPTIONS} value={speed} onChange={onSpeedChange} />
              </div>
            </>
          )}

          {mode === 'build' && (
            <>
              <div className="flex shrink-0 items-center gap-1.5 rounded-badge border border-hairline px-2.5 py-1 text-[13px] font-medium text-ink-2">
                <Pause className="h-3.5 w-3.5" />
                paused
              </div>
              <Clock tick={tick} />
            </>
          )}

          <div className="mx-1 hidden h-6 w-px bg-hairline-2 sm:block" />

          <ThemeToggle />
          <button
            type="button"
            onClick={toggleDebugPanel}
            aria-label="Debug constants"
            aria-pressed={isDebugPanelOpen}
            title="Debug: simulation constants"
            className={`relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex ${
              isDebugPanelOpen ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            <Settings className="h-4 w-4" />
            {isAnyModified && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warn" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
