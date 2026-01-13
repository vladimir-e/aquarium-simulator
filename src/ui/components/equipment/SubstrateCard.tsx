import React from 'react';
import { Select } from '../ui/Select';
import { SUBSTRATE_SURFACE_PER_LITER, type SubstrateType } from '../../../simulation/index.js';

export type { SubstrateType };

export interface SubstrateState {
  type: SubstrateType;
}

interface SubstrateCardProps {
  substrate: SubstrateState;
  tankCapacity: number;
  onTypeChange: (type: SubstrateType) => void;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

const SUBSTRATE_LABELS: Record<SubstrateType, string> = {
  none: 'None',
  sand: 'Sand',
  gravel: 'Gravel',
  aqua_soil: 'Aqua Soil',
};

const SUBSTRATE_DESCRIPTIONS: Record<SubstrateType, string> = {
  none: 'Bare bottom tank - easier to clean but no substrate bacteria',
  sand: 'Fine particles - cannot be vacuumed',
  gravel: 'Medium particles - can be vacuumed',
  aqua_soil: 'Porous, nutrient-rich - best for planted tanks',
};

export function SubstrateCard({
  substrate,
  tankCapacity,
  onTypeChange,
}: SubstrateCardProps): React.JSX.Element {
  const surfacePerLiter = SUBSTRATE_SURFACE_PER_LITER[substrate.type];
  const totalSurface = surfacePerLiter * tankCapacity;

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{getSubstrateIcon(substrate.type)}</span>
        <h4 className="text-sm font-medium text-gray-200">Substrate</h4>
      </div>

      <div className="space-y-3">
        <Select
          label="Type"
          value={substrate.type}
          onChange={(e) => onTypeChange(e.target.value as SubstrateType)}
        >
          {Object.entries(SUBSTRATE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Surface per L:</span>
            <span className="text-gray-300">{surfacePerLiter} cm²/L</span>
          </div>
          <div className="flex justify-between">
            <span>Total Surface:</span>
            <span className="text-gray-300">{formatNumber(totalSurface)} cm²</span>
          </div>
        </div>

        <div className="text-xs text-gray-400">{SUBSTRATE_DESCRIPTIONS[substrate.type]}</div>
      </div>
    </div>
  );
}

export function getSubstrateIcon(type: SubstrateType): string {
  switch (type) {
    case 'sand':
      return '🏖️';
    case 'gravel':
      return '🪨';
    case 'aqua_soil':
      return '🌱';
    default:
      return '⬜';
  }
}

export function formatSubstrateName(type: SubstrateType): string {
  return SUBSTRATE_LABELS[type];
}
