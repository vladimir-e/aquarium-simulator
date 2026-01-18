import React from 'react';
import { Select } from '../ui/Select';
import { Layers } from 'lucide-react';
import { SUBSTRATE_SURFACE_PER_LITER, type SubstrateType } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { gallonsToLiters } from '../../utils/units';

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
  const { unitSystem } = useUnits();
  const surfacePerLiter = SUBSTRATE_SURFACE_PER_LITER[substrate.type];
  const totalSurface = surfacePerLiter * tankCapacity;

  // For imperial, show cm² per gallon (1 gallon = 3.785 liters)
  const surfacePerUnit =
    unitSystem === 'imperial'
      ? Math.round(surfacePerLiter * gallonsToLiters(1))
      : surfacePerLiter;
  const unitLabel = unitSystem === 'imperial' ? 'cm²/gal' : 'cm²/L';

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        {getSubstrateIcon(substrate.type)}
        <h4 className="text-sm font-medium text-gray-200">Substrate</h4>
      </div>

      <div className="space-y-3 flex-1">
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
            <span>Surface per {unitSystem === 'imperial' ? 'gal' : 'L'}:</span>
            <span className="text-gray-300">{surfacePerUnit} {unitLabel}</span>
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

export function getSubstrateIcon(type: SubstrateType): React.ReactNode {
  const className = 'w-4 h-4';
  switch (type) {
    case 'sand':
      return <Layers className={`${className} text-yellow-600`} />;
    case 'gravel':
      return <Layers className={`${className} text-gray-400`} />;
    case 'aqua_soil':
      return <Layers className={`${className} text-green-600`} />;
    default:
      return <Layers className={`${className} text-gray-500`} />;
  }
}

export function formatSubstrateName(type: SubstrateType): string {
  return SUBSTRATE_LABELS[type];
}
