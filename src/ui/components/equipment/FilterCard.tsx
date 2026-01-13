import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { FILTER_SURFACE, FILTER_FLOW, type FilterType } from '../../../simulation/index.js';

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
  const surface = FILTER_SURFACE[filter.type];
  const flow = FILTER_FLOW[filter.type];

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🌊</span>
          <h4 className="text-sm font-medium text-gray-200">Filter</h4>
        </div>
        {filter.enabled && (
          <span className="text-xs px-2 py-0.5 bg-accent-green text-white rounded">
            RUNNING
          </span>
        )}
      </div>

      <div className="space-y-3">
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
            <span className="text-gray-300">{flow} L/h</span>
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
