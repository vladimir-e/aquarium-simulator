import React from 'react';
import { Panel } from '../layout/Panel';

interface LivestockProps {
  food: number;
}

/**
 * Get opacity for food indicator based on food amount.
 * 0g = 0.3 (dim), 2g+ = 1.0 (bright)
 */
function getFoodIndicatorOpacity(food: number): number {
  if (food === 0) return 0.3;
  const intensity = Math.min(food / 2.0, 1.0);
  return 0.3 + intensity * 0.7; // 0.3 to 1.0
}

export function Livestock({ food }: LivestockProps): React.JSX.Element {
  const opacity = getFoodIndicatorOpacity(food);
  const indicatorClass = food === 0 ? 'bg-gray-600' : 'bg-orange-500';

  return (
    <Panel title="Livestock">
      <div className="space-y-3">
        {/* Food indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Food available</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${indicatorClass}`}
              style={{ opacity }}
              title={`${food.toFixed(2)}g food`}
            />
            <span className="text-xs text-gray-400">{food.toFixed(1)}g</span>
          </div>
        </div>

        <div className="text-xs text-gray-400 italic">
          No livestock yet...
        </div>
      </div>
    </Panel>
  );
}
