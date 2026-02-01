import React from 'react';
import { Panel } from '../layout/Panel';
import { getPpm } from '../../../simulation/resources/index.js';
import {
  PhosphateResource,
  PotassiumResource,
  IronResource,
  NitrateResource,
} from '../../../simulation/resources/index.js';

interface NutrientsPanelProps {
  nitrate: number;
  phosphate: number;
  potassium: number;
  iron: number;
  waterVolume: number;
}

interface NutrientDisplayProps {
  name: string;
  value: number;
  waterVolume: number;
  optimalMin: number;
  optimalMax: number;
  unit: string;
  precision: number;
}

/**
 * Get color class based on nutrient level relative to optimal range.
 */
function getNutrientStatusColor(ppm: number, optimalMin: number, optimalMax: number): string {
  if (ppm <= 0.001) return 'bg-red-500'; // Depleted
  if (ppm < optimalMin) return 'bg-yellow-500'; // Low
  if (ppm <= optimalMax) return 'bg-green-500'; // Optimal
  if (ppm <= optimalMax * 2) return 'bg-yellow-500'; // High
  return 'bg-orange-500'; // Very high
}

/**
 * Get status text for a nutrient level.
 */
function getNutrientStatusText(ppm: number, optimalMin: number, optimalMax: number): string {
  if (ppm <= 0.001) return 'Depleted';
  if (ppm < optimalMin) return 'Low';
  if (ppm <= optimalMax) return 'Optimal';
  if (ppm <= optimalMax * 2) return 'High';
  return 'Very High';
}

function NutrientDisplay({
  name,
  value,
  waterVolume,
  optimalMin,
  optimalMax,
  unit,
  precision,
}: NutrientDisplayProps): React.JSX.Element {
  const ppm = waterVolume > 0 ? getPpm(value, waterVolume) : 0;
  const statusColor = getNutrientStatusColor(ppm, optimalMin, optimalMax);
  const statusText = getNutrientStatusText(ppm, optimalMin, optimalMax);

  // Calculate bar width as percentage of 2x optimal max
  const barMax = optimalMax * 2;
  const barPercent = Math.min((ppm / barMax) * 100, 100);

  // Indicator lines for optimal range
  const optimalMinPercent = (optimalMin / barMax) * 100;
  const optimalMaxPercent = (optimalMax / barMax) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200">
            {ppm.toFixed(precision)} {unit}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${statusColor} text-black`}
          >
            {statusText}
          </span>
        </div>
      </div>
      {/* Progress bar with optimal range indicators */}
      <div className="relative h-2 bg-border rounded-full overflow-hidden">
        {/* Optimal range indicator (background) */}
        <div
          className="absolute h-full bg-green-500/20"
          style={{
            left: `${optimalMinPercent}%`,
            width: `${optimalMaxPercent - optimalMinPercent}%`,
          }}
        />
        {/* Current level bar */}
        <div
          className={`h-full ${statusColor} transition-all`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
    </div>
  );
}

export function Nutrients({
  nitrate,
  phosphate,
  potassium,
  iron,
  waterVolume,
}: NutrientsPanelProps): React.JSX.Element {
  return (
    <Panel title="Nutrients">
      <div className="space-y-3">
        <NutrientDisplay
          name="Nitrate (NO3)"
          value={nitrate}
          waterVolume={waterVolume}
          optimalMin={NitrateResource.safeRange?.min ?? 5}
          optimalMax={NitrateResource.safeRange?.max ?? 20}
          unit="ppm"
          precision={1}
        />

        <NutrientDisplay
          name="Phosphate (PO4)"
          value={phosphate}
          waterVolume={waterVolume}
          optimalMin={0.5}
          optimalMax={PhosphateResource.safeRange?.max ?? 2}
          unit="ppm"
          precision={2}
        />

        <NutrientDisplay
          name="Potassium (K)"
          value={potassium}
          waterVolume={waterVolume}
          optimalMin={5}
          optimalMax={PotassiumResource.safeRange?.max ?? 20}
          unit="ppm"
          precision={1}
        />

        <NutrientDisplay
          name="Iron (Fe)"
          value={iron}
          waterVolume={waterVolume}
          optimalMin={0.1}
          optimalMax={IronResource.safeRange?.max ?? 0.5}
          unit="ppm"
          precision={2}
        />

        <div className="text-xs text-gray-500 pt-2 border-t border-border">
          Dose fertilizer to replenish nutrients. Low-demand plants can survive on fish waste alone.
        </div>
      </div>
    </Panel>
  );
}
