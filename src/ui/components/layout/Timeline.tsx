import React, { useState } from 'react';
import { Play, Pause, Gauge, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useConfig } from '../../hooks/useConfig';

type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

/** 30 days in ticks (hours) */
const RESET_CONFIRM_THRESHOLD = 720;

interface TimelineProps {
  isPlaying: boolean;
  speed: SpeedPreset;
  tick: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
  onReset: () => void;
}

export function Timeline({
  isPlaying,
  speed,
  tick,
  onPlayPause,
  onSpeedChange,
  onReset,
}: TimelineProps): React.JSX.Element {
  const { isDebugPanelOpen, toggleDebugPanel, isAnyModified } = useConfig();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetClick = (): void => {
    // Only show confirmation if tick > 30 days
    if (tick > RESET_CONFIRM_THRESHOLD) {
      setShowResetConfirm(true);
    } else {
      onReset();
    }
  };

  const handleConfirmReset = (): void => {
    setShowResetConfirm(false);
    onReset();
  };

  const day = Math.floor(tick / 24);

  return (
    <>
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset Simulation?"
        message={`You have ${day} days of simulation progress. This will reset tick, resources, and alerts while keeping your equipment and plants.`}
        confirmLabel="Reset"
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
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

        {/* Right: Theme, Debug, and Reset buttons (fixed) */}
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <div className="w-px h-6 bg-border" />
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
          <Button onClick={handleResetClick} variant="secondary" className="text-xs flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}
