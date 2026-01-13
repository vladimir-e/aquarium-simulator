import React from 'react';

export interface TankState {
  capacity: number;
  waterLevel: number;
  bacteriaSurface: number;
}

interface TankCardProps {
  tank: TankState;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function TankCard({ tank }: TankCardProps): React.JSX.Element {
  const waterPercent = Math.round((tank.waterLevel / tank.capacity) * 100);

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🐠</span>
        <h4 className="text-sm font-medium text-gray-200">Tank</h4>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Capacity</span>
          <span className="text-gray-200">{tank.capacity} L</span>
        </div>

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
