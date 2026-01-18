import React from 'react';
import { SkipForward } from 'lucide-react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { PRESETS, type PresetId } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';

interface SimulationStatusProps {
  tick: number;
  speed: number;
  isPlaying: boolean;
  currentPreset: PresetId;
  onStep: () => void;
  onPresetChange: (presetId: PresetId) => void;
}

export function SimulationStatus({
  tick,
  speed,
  isPlaying,
  currentPreset,
  onStep,
  onPresetChange,
}: SimulationStatusProps): React.JSX.Element {
  const { unitSystem, toggleUnits } = useUnits();
  const day = Math.floor(tick / 24);
  const hour = tick % 24;
  const time = `${String(hour).padStart(2, '0')}:00`;

  // Convert speed number back to readable format
  const getStepLabel = (speedValue: number): string => {
    switch (speedValue) {
      case 1:
        return 'Step 1hr';
      case 6:
        return 'Step 6hr';
      case 12:
        return 'Step 12hr';
      case 24:
        return 'Step 1 Day';
      default:
        return `Step ${speedValue}hr`;
    }
  };

  // Calculate progress based on current hour in 12-hour cycle
  // This will cycle twice per day (0-11, 12-23)
  const hourIn12HourCycle = hour % 12;
  const progress = hourIn12HourCycle / 12;

  // Circular progress - create pie chart wedge
  const size = 20;
  const center = size / 2;
  const radius = 8;

  const getProgressPath = (progressValue: number): string => {
    const angle = progressValue * 2 * Math.PI;
    const x = center + radius * Math.sin(angle);
    const y = center - radius * Math.cos(angle);
    const largeArcFlag = progressValue > 0.5 ? 1 : 0;

    if (progressValue === 0) {
      return '';
    }

    return `M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x} ${y} Z`;
  };

  return (
    <Panel
      title="Simulation Status"
      action={
        isPlaying ? (
          <svg width={size} height={size}>
            {/* Background circle */}
            <circle cx={center} cy={center} r={radius} fill="currentColor" className="text-gray-700/50" />
            {/* Progress wedge */}
            {progress > 0 && (
              <path d={getProgressPath(progress)} fill="currentColor" className="text-accent-blue" />
            )}
          </svg>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Preset Selector */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">Preset</label>
          <Select
            value={currentPreset}
            onChange={(e) => onPresetChange(e.target.value as PresetId)}
          >
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Unit Switcher */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">Units</label>
          <button
            onClick={toggleUnits}
            className="flex items-center w-full bg-gray-800 border border-border rounded-md overflow-hidden"
          >
            <span
              className={`flex-1 py-1.5 text-sm transition-colors ${
                unitSystem === 'metric'
                  ? 'bg-accent-blue/20 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              L / °C
            </span>
            <span
              className={`flex-1 py-1.5 text-sm transition-colors ${
                unitSystem === 'imperial'
                  ? 'bg-accent-blue/20 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              gal / °F
            </span>
          </button>
        </div>

        {/* Time Display */}
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-100 mb-1">Day {day}</div>
          <div className="text-lg text-gray-400 font-mono">{time}</div>
          <div className="text-xs text-gray-500 mt-1">Tick {tick}</div>
        </div>

        {/* Step Button - Only show when paused */}
        {!isPlaying && (
          <>
            <div className="flex justify-center">
              <Button
                onClick={onStep}
                variant="primary"
                className="flex items-center justify-center gap-2 bg-accent-blue/20 hover:bg-accent-blue/30 border border-border text-gray-200 px-6"
              >
                <SkipForward className="w-4 h-4" />
                <span>{getStepLabel(speed)}</span>
              </Button>
            </div>

            {/* Keyboard Hint */}
            <div className="text-xs text-gray-500 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-gray-700/50 border border-gray-600 rounded text-gray-300">Space</kbd>{' '}
              to step
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
