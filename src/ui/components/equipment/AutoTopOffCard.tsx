import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Droplets } from 'lucide-react';

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
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-accent-blue" />
        <h4 className="text-sm font-medium text-gray-200">Auto Top-Off</h4>
      </div>

      <div className="space-y-3 flex-1">
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
