import { Play, Pause, FastForward } from 'lucide-react';

interface TimelineProps {
  time: string;
  day: number;
  isPlaying: boolean;
  isFastForward: boolean;
  onPlayPause: () => void;
  onFastForward: () => void;
}

/**
 * Timeline - Time display and playback controls
 *
 * Displays:
 * - Play/Pause button
 * - Fast-forward button
 * - Current time (HH:MM format)
 * - Current day number
 */
function Timeline({
  time,
  day,
  isPlaying,
  isFastForward,
  onPlayPause,
  onFastForward,
}: TimelineProps): React.ReactElement {
  return (
    <div className="flex items-center justify-center gap-4">
      {/* Playback controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPlayPause}
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-bg-card] text-[--color-text-primary] shadow-sm transition-colors hover:bg-[--color-bg-secondary]"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="h-5 w-5" fill="currentColor" />
          )}
        </button>

        <button
          onClick={onFastForward}
          className={`focus-ring flex h-10 w-10 items-center justify-center rounded-lg shadow-sm transition-colors ${
            isFastForward
              ? 'bg-[--color-accent-primary] text-white'
              : 'bg-[--color-bg-card] text-[--color-text-primary] hover:bg-[--color-bg-secondary]'
          }`}
          aria-label="Fast forward"
          aria-pressed={isFastForward}
          type="button"
        >
          <FastForward className="h-5 w-5" fill="currentColor" />
        </button>
      </div>

      {/* Time display */}
      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-3xl font-semibold text-[--color-text-primary]">
          {time}
        </span>
        <span className="text-lg font-medium text-[--color-text-secondary]">
          Day {day}
        </span>
      </div>
    </div>
  );
}

export default Timeline;
