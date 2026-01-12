import React from 'react';
import { Button } from '../ui/Button';

type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

interface TimelineProps {
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  onStep: () => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
}

export function Timeline({
  tick,
  isPlaying,
  speed,
  onStep,
  onPlayPause,
  onSpeedChange,
}: TimelineProps) {
  const day = Math.floor(tick / 24);
  const hour = tick % 24;
  const time = `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="sticky top-0 z-10 bg-panel border-b border-border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Step button */}
        <Button onClick={onStep} variant="primary" className="flex items-center gap-2">
          <span>{isPlaying ? '⏸' : '▶'}</span>
          <span className="hidden sm:inline">Step</span>
        </Button>

        {/* Center: Play/Pause + Speed controls */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Button
            onClick={onPlayPause}
            variant="primary"
            className="w-20"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </Button>

          <div className="flex gap-1">
            <Button
              onClick={() => onSpeedChange('1hr')}
              active={speed === '1hr'}
              variant="primary"
            >
              1hr/s
            </Button>
            <Button
              onClick={() => onSpeedChange('6hr')}
              active={speed === '6hr'}
              variant="primary"
            >
              6hrs
            </Button>
            <Button
              onClick={() => onSpeedChange('12hr')}
              active={speed === '12hr'}
              variant="primary"
            >
              12hr/s
            </Button>
            <Button
              onClick={() => onSpeedChange('1day')}
              active={speed === '1day'}
              variant="primary"
            >
              1day/s
            </Button>
          </div>
        </div>

        {/* Right: Display */}
        <div className="flex items-center gap-4 text-sm">
          <div className="text-gray-300">
            <span className="text-gray-500">Day</span>{' '}
            <span className="font-mono">{day}</span>
          </div>
          <div className="text-gray-300">
            <span className="font-mono">{time}</span>
          </div>
          <div className="text-gray-300">
            <span className="text-gray-500">Tick</span>{' '}
            <span className="font-mono">{tick}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
