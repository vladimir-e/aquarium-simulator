import { Button } from '../ui';

export type SpeedPreset = '1hr/s' | '6hr/s' | '12hr/s' | '1day/s';

interface TimelineProps {
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  onStep: () => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
}

const SPEED_PRESETS: SpeedPreset[] = ['1hr/s', '6hr/s', '12hr/s', '1day/s'];

function formatTime(tick: number): string {
  const hour = tick % 24;
  return `${hour.toString().padStart(2, '0')}:00`;
}

function formatDay(tick: number): number {
  return Math.floor(tick / 24);
}

export function Timeline({
  tick,
  isPlaying,
  speed,
  onStep,
  onTogglePlay,
  onSpeedChange,
}: TimelineProps) {
  return (
    <header className="sticky top-0 z-50 bg-bg-primary border-b border-border px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        {/* Left: App title and Step button */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Aquarium
          </span>
          <Button onClick={onStep} disabled={isPlaying} size="sm">
            Step x6
          </Button>
        </div>

        {/* Center: Play/Pause and Speed controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onTogglePlay}
            variant={isPlaying ? 'secondary' : 'default'}
            size="sm"
            className="w-8"
          >
            {isPlaying ? '⏸' : '▶'}
          </Button>

          <div className="flex items-center gap-1 ml-2">
            {SPEED_PRESETS.map((preset) => (
              <Button
                key={preset}
                onClick={() => onSpeedChange(preset)}
                active={speed === preset}
                size="sm"
                variant="ghost"
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>

        {/* Right: Time display */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-primary font-medium">
            Day {formatDay(tick)}
          </span>
          <span className="text-text-secondary">·</span>
          <span className="text-text-secondary">{formatTime(tick)}</span>
          <span className="text-text-secondary">·</span>
          <span className="text-text-muted">Tick {tick}</span>
        </div>
      </div>
    </header>
  );
}
