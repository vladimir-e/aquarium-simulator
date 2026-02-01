import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { WaterChangeCard } from '../actions/WaterChangeCard';
import type { Action, WaterChangeAmount, TrimTargetSize, Plant } from '../../../simulation/index.js';
import { MIN_ALGAE_TO_SCRUB, canTrimPlants, getPlantsToTrimCount } from '../../../simulation/index.js';

interface ActionsProps {
  waterLevel: number;
  capacity: number;
  algae: number;
  plants: Plant[];
  tapWaterTemperature: number;
  tapWaterPH: number;
  executeAction: (action: Action) => void;
  onTapWaterTemperatureChange: (temp: number) => void;
  onTapWaterPHChange: (ph: number) => void;
}

export function Actions({
  waterLevel,
  capacity,
  algae,
  plants,
  tapWaterTemperature,
  tapWaterPH,
  executeAction,
  onTapWaterTemperatureChange,
  onTapWaterPHChange,
}: ActionsProps): React.JSX.Element {
  const [feedAmount, setFeedAmount] = useState(0.5);
  const [trimTargetSize, setTrimTargetSize] = useState<TrimTargetSize>(100);
  const [doseAmount, setDoseAmount] = useState(2.0);

  const handleTopOff = (): void => {
    executeAction({ type: 'topOff' });
  };

  const handleFeed = (): void => {
    executeAction({ type: 'feed', amount: feedAmount });
  };

  const handleScrubAlgae = (): void => {
    executeAction({ type: 'scrubAlgae' });
  };

  const handleWaterChange = (amount: WaterChangeAmount): void => {
    executeAction({ type: 'waterChange', amount });
  };

  const handleTrimPlants = (): void => {
    executeAction({ type: 'trimPlants', targetSize: trimTargetSize });
  };

  const handleTrimTargetChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setTrimTargetSize(parseInt(e.target.value, 10) as TrimTargetSize);
  };

  const handleFeedAmountChange = (value: string): void => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 5.0) {
      setFeedAmount(parsed);
    }
  };

  const handleDose = (): void => {
    executeAction({ type: 'dose', amountMl: doseAmount });
  };

  const handleDoseAmountChange = (value: string): void => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 10.0) {
      setDoseAmount(parsed);
    }
  };

  const isWaterFull = waterLevel >= capacity;
  const canScrub = algae >= MIN_ALGAE_TO_SCRUB;
  // Create a pseudo-state object for canTrimPlants
  const canTrim = canTrimPlants({ plants } as { plants: Plant[] });
  const plantsToTrim = getPlantsToTrimCount({ plants } as { plants: Plant[] }, trimTargetSize);

  return (
    <Panel title="Actions">
      <div className="space-y-3">
        {/* Feed */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-400">Amount (g)</label>
            <input
              type="number"
              value={feedAmount}
              onChange={(e) => handleFeedAmountChange(e.target.value)}
              min="0.1"
              max="5.0"
              step="0.1"
              className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200"
            />
          </div>
          <Button onClick={handleFeed} variant="primary">
            Feed Fish
          </Button>
        </div>

        {/* Top Off */}
        <Button
          onClick={handleTopOff}
          disabled={isWaterFull}
          variant="primary"
        >
          Top Off Water
        </Button>

        {/* Scrub Algae */}
        <Button
          onClick={handleScrubAlgae}
          disabled={!canScrub}
          variant="primary"
        >
          Scrub Algae
        </Button>

        {/* Trim Plants */}
        {plants.length > 0 && (
          <div className="pt-2 border-t border-gray-700">
            <div className="flex items-end gap-2 mb-2">
              <div className="flex-1">
                <Select
                  label="Trim to"
                  value={trimTargetSize}
                  onChange={handleTrimTargetChange}
                >
                  <option value={50}>50%</option>
                  <option value={85}>85%</option>
                  <option value={100}>100%</option>
                </Select>
              </div>
              <Button
                onClick={handleTrimPlants}
                disabled={!canTrim || plantsToTrim === 0}
                variant="primary"
              >
                Trim Plants
              </Button>
            </div>
            {plantsToTrim > 0 && (
              <div className="text-xs text-gray-400">
                {plantsToTrim} plant(s) above {trimTargetSize}%
              </div>
            )}
          </div>
        )}

        {/* Dose Fertilizer */}
        {plants.length > 0 && (
          <div className="pt-2 border-t border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-400">Amount (ml)</label>
              <input
                type="number"
                value={doseAmount}
                onChange={(e) => handleDoseAmountChange(e.target.value)}
                min="0.5"
                max="10.0"
                step="0.5"
                className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200"
              />
            </div>
            <Button onClick={handleDose} variant="primary">
              Dose Fertilizer
            </Button>
            <div className="text-xs text-gray-500 mt-1">
              Adds nutrients for plant growth
            </div>
          </div>
        )}

        {/* Water Change */}
        <WaterChangeCard
          waterLevel={waterLevel}
          tapWaterTemperature={tapWaterTemperature}
          tapWaterPH={tapWaterPH}
          onWaterChange={handleWaterChange}
          onTapWaterTemperatureChange={onTapWaterTemperatureChange}
          onTapWaterPHChange={onTapWaterPHChange}
        />
      </div>
    </Panel>
  );
}
