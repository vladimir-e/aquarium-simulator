import React from 'react';
import { SurfaceResource, LightResource } from '../../../simulation/resources/index.js';
import { useUnits } from '../../hooks/useUnits';
import { formatFlowRate, lphToGph } from '../../utils/units';

interface ResourcesPanelProps {
  surface: number;
  flow: number;
  light: number;
  tankCapacity: number;
}

export function ResourcesPanel({
  surface,
  flow,
  light,
  tankCapacity,
}: ResourcesPanelProps): React.JSX.Element {
  const { unitSystem } = useUnits();

  // Calculate turnovers per hour (flow / tank capacity)
  const turnoversPerHour = tankCapacity > 0 ? flow / tankCapacity : 0;

  // Flow is stored in L/h internally, convert to GPH for display if imperial
  const flowGph = Math.round(lphToGph(flow));

  return (
    <div className="bg-panel rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-gray-200 mb-3">Passive Resources</h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Total Surface</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {SurfaceResource.format(surface)}
            </span>
            <span className="text-xs text-gray-500 ml-2">bacteria colonization</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Total Flow</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {formatFlowRate(flowGph, unitSystem)}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              ({turnoversPerHour.toFixed(1)}x/hour)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Light</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {light > 0 ? LightResource.format(light) : 'Off'}
            </span>
            <span className="text-xs text-gray-500 ml-2">photoperiod</span>
          </div>
        </div>
      </div>
    </div>
  );
}
