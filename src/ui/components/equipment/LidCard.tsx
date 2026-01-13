import React from 'react';
import { Select } from '../ui/Select';

export type LidType = 'none' | 'mesh' | 'full' | 'sealed';

export interface LidState {
  type: LidType;
}

interface LidCardProps {
  lid: LidState;
  onTypeChange: (type: LidType) => void;
}

const LID_DESCRIPTIONS: Record<LidType, string> = {
  none: '100% evaporation',
  mesh: '75% evaporation',
  full: '25% evaporation',
  sealed: '0% evaporation',
};

export function LidCard({ lid, onTypeChange }: LidCardProps): React.JSX.Element {
  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔲</span>
          <h4 className="text-sm font-medium text-gray-200">Lid</h4>
        </div>
      </div>

      <div className="space-y-3">
        <Select
          label="Type"
          value={lid.type}
          onChange={(e) => onTypeChange(e.target.value as LidType)}
        >
          <option value="none">None</option>
          <option value="mesh">Mesh</option>
          <option value="full">Full</option>
          <option value="sealed">Sealed</option>
        </Select>

        <div className="text-xs text-gray-400">
          {LID_DESCRIPTIONS[lid.type]}
        </div>
      </div>
    </div>
  );
}
