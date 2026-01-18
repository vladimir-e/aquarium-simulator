import React from 'react';
import { Select } from '../ui/Select';
import { Container } from 'lucide-react';
import { useUnits } from '../../hooks/useUnits';
import { getTankSizeOptions, findClosestTankSize } from '../../utils/units';

export interface TankState {
  capacity: number;
  waterLevel: number;
}

interface TankCardProps {
  tank: TankState;
  onCapacityChange?: (capacity: number) => void;
}

export function TankCard({ tank, onCapacityChange }: TankCardProps): React.JSX.Element {
  const { unitSystem, formatVol } = useUnits();
  const waterPercent = Math.round((tank.waterLevel / tank.capacity) * 100);

  const tankSizes = getTankSizeOptions(unitSystem);
  // Find current selection (snap to closest if between sizes)
  const currentSize = findClosestTankSize(tank.capacity, unitSystem);

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Container className="w-4 h-4 text-accent-blue" />
        <h4 className="text-sm font-medium text-gray-200">Tank</h4>
      </div>

      <div className="space-y-2 flex-1">
        {onCapacityChange && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tank Size</label>
            <Select
              value={currentSize.liters}
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
            {formatVol(tank.waterLevel)} ({waterPercent}%)
          </span>
        </div>

        <div className="text-xs text-gray-400 mt-2">
          Glass walls provide bacteria colonization surface
        </div>
      </div>
    </div>
  );
}
