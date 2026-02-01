import React, { useState } from 'react';
import { SkipForward, RotateCcw } from 'lucide-react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PRESETS, type PresetId } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';

interface SimulationStatusProps {
  tick: number;
  speed: number;
  isPlaying: boolean;
  currentPreset: PresetId;
  isPresetModified: boolean;
  onStep: () => void;
  onPresetChange: (presetId: PresetId) => void;
}

export function SimulationStatus({
  tick,
  speed,
  isPlaying,
  currentPreset,
  isPresetModified,
  onStep,
  onPresetChange,
}: SimulationStatusProps): React.JSX.Element {
  const { unitSystem, toggleUnits } = useUnits();
  const day = Math.floor(tick / 24);
  const hour = tick % 24;
  const time = `${String(hour).padStart(2, '0')}:00`;

  // Confirmation dialogs state
  const [showPresetConfirm, setShowPresetConfirm] = useState(false);
  const [showResetToPresetConfirm, setShowResetToPresetConfirm] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<PresetId | null>(null);

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

  const handlePresetChange = (presetId: PresetId): void => {
    // Always show confirmation for preset change
    setPendingPresetId(presetId);
    setShowPresetConfirm(true);
  };

  const confirmPresetChange = (): void => {
    if (pendingPresetId) {
      onPresetChange(pendingPresetId);
    }
    setShowPresetConfirm(false);
    setPendingPresetId(null);
  };

  const cancelPresetChange = (): void => {
    setShowPresetConfirm(false);
    setPendingPresetId(null);
  };

  const handleResetToPreset = (): void => {
    setShowResetToPresetConfirm(true);
  };

  const confirmResetToPreset = (): void => {
    onPresetChange(currentPreset);
    setShowResetToPresetConfirm(false);
  };

  const presetName = PRESETS.find((p) => p.id === currentPreset)?.name ?? currentPreset;
  const pendingPresetName = pendingPresetId
    ? PRESETS.find((p) => p.id === pendingPresetId)?.name ?? pendingPresetId
    : '';

  return (
    <>
      <ConfirmDialog
        isOpen={showPresetConfirm}
        title="Switch Preset?"
        message={`This will reset everything to the "${pendingPresetName}" preset. All current progress will be lost.`}
        confirmLabel="Switch"
        onConfirm={confirmPresetChange}
        onCancel={cancelPresetChange}
      />

      <ConfirmDialog
        isOpen={showResetToPresetConfirm}
        title="Restore Defaults?"
        message={`This will restore "${presetName}" to its default configuration. All current progress will be lost.`}
        confirmLabel="Restore"
        onConfirm={confirmResetToPreset}
        onCancel={() => setShowResetToPresetConfirm(false)}
      />

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
          {/* Preset Selector with Restore Button */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Preset</label>
            <div className="flex gap-2">
              <Select
                value={currentPreset}
                onChange={(e) => handlePresetChange(e.target.value as PresetId)}
                className="flex-1"
              >
                {PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </Select>
              {isPresetModified && (
                <button
                  onClick={handleResetToPreset}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 border border-border rounded-md transition-colors"
                  title="Restore preset defaults"
                >
                  <RotateCcw className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Unit Switcher */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Units</label>
            <button
              onClick={toggleUnits}
              className="flex items-center w-full bg-border border border-border rounded-md overflow-hidden"
            >
              <span
                className={`flex-1 py-1.5 text-sm transition-colors ${
                  unitSystem === 'metric'
                    ? 'bg-accent-blue text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                L / °C
              </span>
              <span
                className={`flex-1 py-1.5 text-sm transition-colors ${
                  unitSystem === 'imperial'
                    ? 'bg-accent-blue text-white'
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
                Press <kbd className="px-1.5 py-0.5 bg-border/50 border border-border rounded text-gray-300">Space</kbd>{' '}
                to step
              </div>
            </>
          )}
        </div>
      </Panel>
    </>
  );
}
