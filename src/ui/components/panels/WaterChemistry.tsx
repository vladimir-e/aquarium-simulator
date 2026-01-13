import React from 'react';
import { Panel } from '../layout/Panel';

interface WaterChemistryProps {
  waste: number;
}

export function WaterChemistry({ waste }: WaterChemistryProps): React.JSX.Element {
  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Waste */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Waste</span>
          <span className="text-sm text-gray-200">{waste.toFixed(2)}g</span>
        </div>

        <div className="text-xs text-gray-400 italic">
          More parameters coming soon...
        </div>
      </div>
    </Panel>
  );
}
