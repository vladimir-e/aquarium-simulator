import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import type { Action } from '../../../simulation/index.js';
import { MIN_ALGAE_TO_SCRUB } from '../../../simulation/index.js';

interface ActionsProps {
  waterLevel: number;
  capacity: number;
  algae: number;
  executeAction: (action: Action) => void;
}

export function Actions({
  waterLevel,
  capacity,
  algae,
  executeAction,
}: ActionsProps): React.JSX.Element {
  const [feedAmount, setFeedAmount] = useState(0.5);

  const handleTopOff = (): void => {
    executeAction({ type: 'topOff' });
  };

  const handleFeed = (): void => {
    executeAction({ type: 'feed', amount: feedAmount });
  };

  const handleScrubAlgae = (): void => {
    executeAction({ type: 'scrubAlgae' });
  };

  const handleFeedAmountChange = (value: string): void => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 5.0) {
      setFeedAmount(parsed);
    }
  };

  const isWaterFull = waterLevel >= capacity;
  const canScrub = algae >= MIN_ALGAE_TO_SCRUB;

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
      </div>
    </Panel>
  );
}
