import React from 'react';
import { Play, Pause, Gauge, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConfig } from '../../hooks/useConfig';

type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

interface TimelineProps {
  isPlaying: boolean;
  speed: SpeedPreset;
  onPlayPause: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
  onReset: () => void;
}

export function Timeline({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onReset,
}: TimelineProps): React.JSX.Element {
  const { isDebugPanelOpen, toggleDebugPanel, isAnyModified } = useConfig();

  return (
    <div className="sticky top-0 z-10 bg-panel border-b border-border px-4 py-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        {/* Left: Title (fixed) */}
        <div className="text-xs font-semibold text-gray-400 tracking-wider leading-tight">
          AQUARIUM
          <br />
          SIMULATOR
        </div>

        {/* Center: Auto-play Controls (flexible) */}
        <div className="flex items-center justify-center gap-3">
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

          <div className="w-px h-6 bg-border" />

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
        </div>

        {/* Right: Reset and Debug buttons (fixed) */}
        <div className="flex items-center gap-2">
          <Button
            onClick={toggleDebugPanel}
            variant="secondary"
            active={isDebugPanelOpen}
            className={`text-xs flex items-center gap-1.5 relative ${
              isAnyModified && !isDebugPanelOpen ? 'text-yellow-400' : ''
            }`}
            title="Debug: Simulation Constants"
          >
            <Settings className="w-3.5 h-3.5" />
            Debug
            {isAnyModified && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400" />
            )}
          </Button>
          <Button onClick={onReset} variant="secondary" className="text-xs flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
