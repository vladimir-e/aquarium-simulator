import React from 'react';
import { Play, Pause, Gauge, RotateCcw, SkipForward } from 'lucide-react';
import { Button } from '../ui/Button';

type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  '1hr': 1,
  '6hr': 6,
  '12hr': 12,
  '1day': 24,
};

interface TimelineProps {
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  onStep: () => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
  onReset: () => void;
}

export function Timeline({
  tick,
  isPlaying,
  speed,
  onStep,
  onPlayPause,
  onSpeedChange,
  onReset,
}: TimelineProps): React.JSX.Element {
  const day = Math.floor(tick / 24);
  const hour = tick % 24;
  const time = `${String(hour).padStart(2, '0')}:00`;
  const speedMultiplier = SPEED_MULTIPLIERS[speed];

  return (
    <div className="sticky top-0 z-10 bg-panel border-b border-border px-4 py-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        {/* Left: Title (fixed) */}
        <div className="text-xs font-semibold text-gray-400 tracking-wider leading-tight">
          AQUARIUM
          <br />
          SIMULATOR
        </div>

        {/* Center: Controls + Display (flexible) */}
        <div className="flex items-center justify-center gap-3">
          {/* Step Button - Icon only with badge */}
          <Button
            onClick={() => {
              if (isPlaying) {
                onPlayPause();
              } else {
                onStep();
              }
            }}
            variant="primary"
            className="relative w-9 h-9 p-1 flex items-center justify-center bg-accent-blue/20 hover:bg-accent-blue/30 border border-border text-gray-200"
          >
            <SkipForward className="w-full h-full" />
            {speedMultiplier > 1 && (
              <span className="absolute -top-1.5 -right-1.5 bg-gray-700/80 text-gray-300 text-[10px] font-medium rounded-full w-5 h-5 flex items-center justify-center border border-gray-600">
                {speedMultiplier}
              </span>
            )}
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Play/Pause Button - Circular and prominent */}
          <Button
            onClick={onPlayPause}
            variant="primary"
            className={`w-9 h-9 p-1 flex items-center justify-center border rounded-full ${
              isPlaying
                ? 'bg-accent-orange/20 hover:bg-accent-orange/30 border-accent-orange/50 text-accent-orange'
                : 'bg-accent-green/20 hover:bg-accent-green/30 border-accent-green/50 text-accent-green'
            }`}
          >
            {isPlaying ? <Pause className="w-full h-full" /> : <Play className="w-full h-full" />}
          </Button>

          <div className="flex items-center gap-1">
            <Gauge className="w-4 h-4 text-gray-500 mr-1" />
            <Button
              onClick={() => onSpeedChange('1hr')}
              active={speed === '1hr'}
              variant="primary"
              className="text-xs"
            >
              1hr/s
            </Button>
            <Button
              onClick={() => onSpeedChange('6hr')}
              active={speed === '6hr'}
              variant="primary"
              className="text-xs"
            >
              6hr/s
            </Button>
            <Button
              onClick={() => onSpeedChange('12hr')}
              active={speed === '12hr'}
              variant="primary"
              className="text-xs"
            >
              12hr/s
            </Button>
            <Button
              onClick={() => onSpeedChange('1day')}
              active={speed === '1day'}
              variant="primary"
              className="text-xs"
            >
              1day/s
            </Button>
          </div>

          <div className="w-px h-6 bg-border" />

          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>
              Day <span className="text-gray-200 font-mono">{day}</span>
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-200 font-mono">{time}</span>
            <span className="text-gray-400">·</span>
            <span>
              Tick <span className="text-gray-200 font-mono">{tick}</span>
            </span>
          </div>
        </div>

        {/* Right: Reset button (fixed) */}
        <Button onClick={onReset} variant="secondary" className="text-xs flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
      </div>
    </div>
  );
}
