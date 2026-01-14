import React from 'react';
import { Panel } from '../layout/Panel';
import { AlgaeResource } from '../../../simulation/resources/index.js';

interface PlantsProps {
  algae: number;
}

/**
 * Get opacity for algae indicator based on algae level.
 * 0 = 0.3 (dim), 100 = 1.0 (bright bloom)
 */
function getAlgaeIndicatorOpacity(algae: number): number {
  if (algae === 0) return 0.3;
  const intensity = Math.min(algae / 100, 1.0);
  return 0.3 + intensity * 0.7; // 0.3 to 1.0
}

/**
 * Get algae description based on level.
 */
function getAlgaeDescription(algae: number): string {
  if (algae < 5) return 'Clean';
  if (algae < 30) return 'Trace';
  if (algae < 50) return 'Visible';
  if (algae < 80) return 'High';
  return 'Bloom!';
}

export function Plants({ algae }: PlantsProps): React.JSX.Element {
  const opacity = getAlgaeIndicatorOpacity(algae);
  const indicatorClass = algae === 0 ? 'bg-gray-600' : 'bg-green-500';
  const description = getAlgaeDescription(algae);

  return (
    <Panel title="Plants">
      <div className="space-y-3">
        {/* Algae indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Algae</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${indicatorClass}`}
              style={{ opacity }}
              title={`${AlgaeResource.format(algae)} algae level`}
            />
            <span className="text-xs text-gray-400">
              {AlgaeResource.format(algae)} ({description})
            </span>
          </div>
        </div>

        <div className="text-xs text-gray-400 italic">
          No plants yet...
        </div>
      </div>
    </Panel>
  );
}
