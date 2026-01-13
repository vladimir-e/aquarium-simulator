import React from 'react';
import { Select } from '../ui/Select';

export interface TankState {
  capacity: number;
  waterLevel: number;
  bacteriaSurface: number;
}

interface TankCardProps {
  tank: TankState;
  onCapacityChange?: (capacity: number) => void;
}

const tankSizes = [
  { liters: 20, display: '20L (5 gal)' },
  { liters: 40, display: '40L (10 gal)' },
  { liters: 75, display: '75L (20 gal)' },
  { liters: 150, display: '150L (40 gal)' },
  { liters: 200, display: '200L (50 gal)' },
  { liters: 300, display: '300L (75 gal)' },
  { liters: 400, display: '400L (100 gal)' },
];

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function TankCard({ tank, onCapacityChange }: TankCardProps): React.JSX.Element {
  const waterPercent = Math.round((tank.waterLevel / tank.capacity) * 100);

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🐠</span>
        <h4 className="text-sm font-medium text-gray-200">Tank</h4>
      </div>

      <div className="space-y-2 flex-1">
        {onCapacityChange && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tank Size</label>
            <Select
              value={tank.capacity}
              onChange={(e) => onCapacityChange(Number(e.target.value))}
            >
              {tankSizes.map((size) => (
                <option key={size.liters} value={size.liters}>
                  {size.display}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Water Level</span>
          <span className="text-gray-200">
            {tank.waterLevel.toFixed(1)} L ({waterPercent}%)
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Glass Surface</span>
          <span className="text-gray-200">{formatNumber(tank.bacteriaSurface)} cm²</span>
        </div>

        <div className="text-xs text-gray-400 mt-2">
          Glass walls provide bacteria colonization surface
        </div>
      </div>
    </div>
  );
}
