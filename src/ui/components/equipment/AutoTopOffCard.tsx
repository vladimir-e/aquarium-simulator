import React from 'react';
import { Toggle } from '../ui/Toggle';

export interface AutoTopOffState {
  enabled: boolean;
}

interface AutoTopOffCardProps {
  ato: AutoTopOffState;
  onEnabledChange: (enabled: boolean) => void;
}

export function AutoTopOffCard({
  ato,
  onEnabledChange,
}: AutoTopOffCardProps): React.JSX.Element {
  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💧</span>
          <h4 className="text-sm font-medium text-gray-200">Auto Top-Off</h4>
        </div>
        {ato.enabled && (
          <span className="text-xs px-2 py-0.5 bg-accent-blue text-white rounded">
            ACTIVE
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Toggle
          label="Enabled"
          checked={ato.enabled}
          onChange={onEnabledChange}
        />

        <div className="text-xs text-gray-400">
          {ato.enabled
            ? 'Maintains water at 100% when level drops below 99%'
            : 'Water level will decrease from evaporation'}
        </div>
      </div>
    </div>
  );
}
