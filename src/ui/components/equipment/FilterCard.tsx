import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Waves } from 'lucide-react';
import { FILTER_SURFACE, FILTER_FLOW, type FilterType } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { lphToGph } from '../../utils/units';

export type { FilterType };

export interface FilterState {
  enabled: boolean;
  type: FilterType;
}

interface FilterCardProps {
  filter: FilterState;
  onEnabledChange: (enabled: boolean) => void;
  onTypeChange: (type: FilterType) => void;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

const FILTER_LABELS: Record<FilterType, string> = {
  sponge: 'Sponge',
  hob: 'HOB (Hang-On-Back)',
  canister: 'Canister',
  sump: 'Sump',
};

export function FilterCard({
  filter,
  onEnabledChange,
  onTypeChange,
}: FilterCardProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const surface = FILTER_SURFACE[filter.type];
  const flowLph = FILTER_FLOW[filter.type];

  // Format flow based on unit system
  const flowDisplay =
    unitSystem === 'imperial'
      ? `${Math.round(lphToGph(flowLph))} GPH`
      : `${flowLph} L/h`;

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Waves className="w-4 h-4 text-accent-blue" />
        <h4 className="text-sm font-medium text-gray-200">Filter</h4>
      </div>

      <div className="space-y-3 flex-1">
        <Toggle label="Enabled" checked={filter.enabled} onChange={onEnabledChange} />

        <Select
          label="Type"
          value={filter.type}
          onChange={(e) => onTypeChange(e.target.value as FilterType)}
        >
          {Object.entries(FILTER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Flow Rate:</span>
            <span className="text-gray-300">{flowDisplay}</span>
          </div>
          <div className="flex justify-between">
            <span>Surface Area:</span>
            <span className="text-gray-300">{formatNumber(surface)} cm²</span>
          </div>
        </div>

        {!filter.enabled && (
          <div className="text-xs text-warning">
            Warning: Filter off - no biological filtration
          </div>
        )}
      </div>
    </div>
  );
}
