import React from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import type { DailySchedule } from '../../../simulation/index.js';
import { scheduleSpans } from '../../build';
import { SPEED_LABELS, SPEED_PRESETS, type SpeedPreset } from '../../run';
import { TICKS_PER_DAY, dayNumber, formatDayClock, hourOfDay } from '../../utils/clock';
import { Pill } from '../run/elements';
import { Segmented } from '../ui/Segmented';

const SPEED_OPTIONS = SPEED_PRESETS.map((preset) => ({
  value: preset,
  label: SPEED_LABELS[preset],
}));

function pad(hour: number): string {
  return String(hour).padStart(2, '0');
}

function Photoperiod({
  schedule,
  hour,
  lightOn,
}: {
  schedule: DailySchedule;
  hour: number;
  lightOn: boolean;
}): React.JSX.Element {
  const end = (schedule.startHour + schedule.duration) % 24;
  return (
    <div>
      <div className="relative h-2.5 rounded-badge bg-track">
        {lightOn &&
          scheduleSpans(schedule).map((span) => (
            <span
              key={span.from}
              aria-hidden
              className="absolute inset-y-0 rounded-badge bg-warn-tint"
              style={{ left: `${span.from * 100}%`, width: `${(span.to - span.from) * 100}%` }}
            />
          ))}
        <span
          aria-hidden
          className="absolute -top-1 bottom-[-4px] w-px bg-ink"
          style={{ left: `${(hour / TICKS_PER_DAY) * 100}%` }}
        />
      </div>
      <div className="flex justify-between pt-1 font-mono text-[10px] leading-none text-ink-3">
        <span>00:00</span>
        <span>{lightOn ? `lights ${pad(schedule.startHour)}–${pad(end)}` : 'no light'}</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

interface TimelineCardProps {
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  lightSchedule: DailySchedule;
  lightOn: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
}

/**
 * Head of the index rail. Before the first tick the transport gives way to
 * `Start simulation` — a run that has not begun has nothing to transport.
 */
export function TimelineCard({
  tick,
  isPlaying,
  speed,
  lightSchedule,
  lightOn,
  onPlayPause,
  onStep,
  onSpeedChange,
}: TimelineCardProps): React.JSX.Element {
  const days = dayNumber(tick) - 1;
  const hour = hourOfDay(tick);
  const started = tick > 0 || isPlaying;

  return (
    <section
      aria-label="Timeline"
      className="shrink-0 rounded-card border border-hairline bg-surface p-2.5"
    >
      <div className="flex items-center gap-2 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">
          Timeline
        </span>
        <span className="ml-auto">
          {started ? (
            <Pill variant={isPlaying ? 'ok' : 'neutral'}>
              {isPlaying ? `running · ${SPEED_LABELS[speed]}` : 'paused'}
            </Pill>
          ) : (
            <Pill variant="neutral">not started</Pill>
          )}
        </span>
      </div>

      {started ? (
        <div className="flex items-center gap-2.5 pb-2.5">
          <button
            type="button"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-2 bg-surface-2 text-ink transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <p className="font-mono text-[17px] font-semibold leading-tight tracking-[-0.01em]">
              {formatDayClock(tick)}
            </p>
            <p className="font-mono text-[11px] leading-tight text-ink-3">
              tick {tick} · {days} d elapsed
            </p>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onPlayPause}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-control bg-accent text-[14px] font-semibold text-surface transition-[transform,opacity] hover:opacity-90 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Play className="h-4 w-4" />
            Start simulation
          </button>
          <p className="py-2 text-center font-mono text-[11px] text-ink-3">
            Day 1 · 00:00 · tick 0
          </p>
        </>
      )}

      <Photoperiod schedule={lightSchedule} hour={hour} lightOn={lightOn} />

      <div className="pt-2.5">
        <Segmented
          fill
          ariaLabel="Speed"
          options={SPEED_OPTIONS}
          value={speed}
          onChange={onSpeedChange}
        />
      </div>

      <button
        type="button"
        onClick={onStep}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-hairline bg-surface text-[13px] font-medium text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <SkipForward className="h-3.5 w-3.5" />
        Step +1 day
      </button>
    </section>
  );
}
