import React from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import type { Action } from '../../../simulation/index.js';

interface ActionsProps {
  waterLevel: number;
  capacity: number;
  executeAction: (action: Action) => void;
}

export function Actions({
  waterLevel,
  capacity,
  executeAction,
}: ActionsProps): React.JSX.Element {
  const handleTopOff = (): void => {
    executeAction({ type: 'topOff' });
  };

  const isWaterFull = waterLevel >= capacity;

  return (
    <Panel title="Actions">
      <div className="space-y-2">
        <Button
          onClick={handleTopOff}
          disabled={isWaterFull}
          variant="primary"
        >
          Top Off Water
        </Button>
      </div>
    </Panel>
  );
}
